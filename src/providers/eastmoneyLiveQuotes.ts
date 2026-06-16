import { parseBeijingTimeMs, resolveIopvPremium, type IopvPoint } from "../domain/iopvAlignment";
import { fetchFundEstimate } from "./eastmoneyIopv";
import { eastMoneySecid } from "./eastmoneyOnExchangeQuotes";
import { fetchWithTimeout, mapConcurrent } from "./requestUtils";

export { parseBeijingTimeMs } from "../domain/iopvAlignment";

export interface LivePrice {
  price: number;
  priceTimeMs: number | null;
}

export interface LivePremiumRow {
  fundCode: string;
  price: number | null;
  priceTime: string | null;
  iopv: number | null;
  iopvTime: string | null;
  iopvPremiumDiscountRate: number | null;
  aligned: boolean | null;
  iopvSource: "current" | "trade_date_match" | "none";
}

const LIVE_PRICE_HOSTS = ["https://push2.eastmoney.com", "https://push2delay.eastmoney.com"];

export function parseLivePrices(payload: unknown): Map<string, LivePrice> {
  const rows = (payload as { data?: { diff?: Array<Record<string, unknown>> } }).data?.diff ?? [];
  const map = new Map<string, LivePrice>();
  for (const row of rows) {
    const code = String(row.f12 ?? "");
    const price = Number(row.f2);
    if (!code || !Number.isFinite(price) || price <= 0) continue;
    const epochSec = Number(row.f124);
    map.set(code, { price, priceTimeMs: Number.isFinite(epochSec) && epochSec > 0 ? epochSec * 1000 : null });
  }
  return map;
}

async function fetchLivePrices(fetchImpl: typeof fetch, codes: string[], timeoutMs?: number): Promise<Map<string, LivePrice>> {
  if (codes.length === 0) return new Map();
  const params = new URLSearchParams({
    fltt: "2",
    secids: codes.map((code) => eastMoneySecid(code)).join(","),
    fields: "f12,f2,f124"
  });
  for (const host of LIVE_PRICE_HOSTS) {
    try {
      const response = await fetchWithTimeout(
        fetchImpl,
        `${host}/api/qt/ulist.np/get?${params.toString()}`,
        { headers: { "User-Agent": "Mozilla/5.0 ETFLimit/0.1", Referer: "https://quote.eastmoney.com/" } },
        timeoutMs
      );
      if (!response.ok) continue;
      const prices = parseLivePrices(await response.json());
      if (prices.size > 0) return prices;
    } catch {
      continue;
    }
  }
  return new Map();
}

export interface FetchLivePremiumsOptions {
  timeoutMs?: number;
  priorSnapshotsByCode?: Map<string, IopvPoint[]>;
  tradeDateByCode?: Map<string, string>;
}

export async function fetchLivePremiums(
  fetchImpl: typeof fetch,
  codes: string[],
  options: FetchLivePremiumsOptions = {}
): Promise<LivePremiumRow[]> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const priceMap = await fetchLivePrices(fetchImpl, codes, timeoutMs);
  const estimates = await mapConcurrent(codes, 6, (code) => fetchFundEstimate(fetchImpl, code, timeoutMs));

  return codes.map((code, index) => {
    const live = priceMap.get(code) ?? null;
    const estimate = estimates[index];
    const resolved = resolveIopvPremium({
      price: live?.price ?? null,
      priceTimeMs: live?.priceTimeMs ?? null,
      tradeDate: options.tradeDateByCode?.get(code) ?? null,
      current: estimate ? { iopv: estimate.iopv, iopvTime: estimate.iopvTime } : null,
      priorSnapshots: options.priorSnapshotsByCode?.get(code) ?? []
    });
    return {
      fundCode: code,
      price: resolved.price,
      priceTime: resolved.priceTimeMs != null ? new Date(resolved.priceTimeMs).toISOString() : null,
      iopv: resolved.iopv,
      iopvTime: resolved.iopvTime,
      iopvPremiumDiscountRate: resolved.iopvPremiumDiscountRate,
      aligned: resolved.aligned,
      iopvSource: resolved.iopvSource
    };
  });
}
