import { calculateClosingPremiumDiscount, calculateIopvPremiumDiscount } from "../domain/quotes";
import type { Fund, FundQuote } from "../domain/types";
import { fetchFundEstimate, type FundEstimate } from "./eastmoneyIopv";
import { fetchWithTimeout, mapConcurrent } from "./requestUtils";
import type { DataProvider } from "./types";

const SOURCE = "eastmoney-on-exchange-quote";
const SPOT_SOURCE = "eastmoney-on-exchange-spot";
const LIVE_PRICE_HOSTS = ["https://push2.eastmoney.com", "https://push2delay.eastmoney.com"];

interface ProviderOptions {
  fetchImpl?: typeof fetch;
  dataDate?: string;
  syncRunId?: string;
  concurrency?: number;
  requestTimeoutMs?: number;
}

interface KlineLatest {
  closePrice: number;
  turnover: number;
  tradeDate: string;
}

interface NavLatest {
  navDate: string;
  unitNav: number;
}

interface SpotQuote {
  fundCode: string;
  closePrice: number;
  turnover?: number;
  tradeDate: string;
}

export function eastMoneySecid(code: string): string {
  if (code.startsWith("5")) return `1.${code}`;
  return `0.${code}`;
}

export function parseEastMoneyKlineLatest(payload: unknown, beforeDate?: string): KlineLatest {
  const klines = (payload as { data?: { klines?: string[] } }).data?.klines ?? [];
  const eligible = beforeDate ? klines.filter((row) => row.slice(0, 10) < beforeDate) : klines;
  const latest = eligible.at(-1);
  if (!latest) throw new Error("Missing kline rows");
  const [tradeDate, , close, , , , amount] = latest.split(",");
  const closePrice = Number(close);
  const turnover = Number(amount);
  if (!tradeDate || !Number.isFinite(closePrice)) throw new Error("Invalid kline row");
  return { closePrice, turnover, tradeDate };
}

export function parseEastMoneyNavLatest(payload: string): NavLatest {
  const content = payload.match(/content\s*:\s*["']([\s\S]*?)["']\s*,/)?.[1] ?? payload;
  const text = decodeEscapedHtml(content);
  const cells = [...text.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => normalizeText(match[1]));
  const dateIndex = cells.findIndex((cell) => /^\d{4}-\d{2}-\d{2}$/.test(cell));
  if (dateIndex < 0) throw new Error("Missing NAV date");
  const unitNav = Number(cells.slice(dateIndex + 1).find((cell) => /^\d+(\.\d+)?$/.test(cell)));
  if (!Number.isFinite(unitNav)) throw new Error("Missing unit NAV");
  return { navDate: cells[dateIndex], unitNav };
}

export function parseEastMoneySpotQuotes(payload: unknown, dataDate: string): SpotQuote[] {
  const rows = (payload as { data?: { diff?: Array<Record<string, unknown>> } }).data?.diff ?? [];
  const tradeDate = previousCalendarDate(dataDate);

  return rows.flatMap((row) => {
    const fundCode = String(row.f12 ?? "");
    const closePrice = Number(row.f18);
    const turnover = Number(row.f6);
    if (!fundCode || !Number.isFinite(closePrice)) return [];
    return [{
      fundCode,
      closePrice,
      turnover: Number.isFinite(turnover) ? turnover : undefined,
      tradeDate
    }];
  });
}

export function createEastMoneyOnExchangeQuoteProvider(funds: Fund[], options: ProviderOptions = {}): DataProvider<FundQuote[]> {
  return {
    name: SOURCE,
    fetch: async () => {
      const fetchImpl = options.fetchImpl ?? fetch;
      const dataDate = options.dataDate ?? new Date().toISOString().slice(0, 10);
      const syncRunId = options.syncRunId ?? `eastmoney-quotes-${new Date().toISOString().slice(0, 10)}`;
      const concurrency = options.concurrency ?? 4;
      const timeoutMs = options.requestTimeoutMs ?? 12_000;
      const onExchangeFunds = funds.filter((item) => item.enabled && item.venue === "on_exchange");
      const spotByCode = await fetchSpotQuoteMap(fetchImpl, onExchangeFunds, dataDate, timeoutMs);

      const quoteResults = await mapConcurrent(onExchangeFunds, concurrency, async (fund) => {
        try {
          const kline = await fetchKline(fetchImpl, fund.code, dataDate, timeoutMs);
          return buildQuote(fetchImpl, fund.code, {
            closePrice: kline.closePrice,
            turnover: kline.turnover,
            tradeDate: kline.tradeDate,
            source: SOURCE,
            syncRunId
          }, timeoutMs);
        } catch {
          const spot = spotByCode.get(fund.code);
          if (!spot) return null;
          return buildQuote(fetchImpl, fund.code, {
            closePrice: spot.closePrice,
            turnover: spot.turnover,
            tradeDate: spot.tradeDate,
            source: SPOT_SOURCE,
            syncRunId
          }, timeoutMs);
        }
      });

      const quotes = quoteResults.filter((quote): quote is FundQuote => quote != null);
      if (quotes.length === 0) return { ok: false, errorCategory: "missing_fields", message: "No on-exchange quotes fetched" };
      const latestDate = quotes.map((quote) => quote.tradeDate).sort().at(-1) ?? new Date().toISOString().slice(0, 10);
      const source = quotes.every((quote) => quote.source === SOURCE)
        ? SOURCE
        : quotes.every((quote) => quote.source === SPOT_SOURCE)
          ? SPOT_SOURCE
          : `${SOURCE}+${SPOT_SOURCE}`;
      return { ok: true, data: quotes, source, dataDate: latestDate, confidence: 0.85 };
    }
  };
}

async function buildQuote(
  fetchImpl: typeof fetch,
  fundCode: string,
  price: { closePrice: number; turnover?: number; tradeDate: string; source: string; syncRunId: string },
  timeoutMs: number
): Promise<FundQuote> {
  const estimate = await fetchFundEstimate(fetchImpl, fundCode, timeoutMs);
  const nav = await resolveNav(fetchImpl, fundCode, estimate, timeoutMs);
  return {
    fundCode,
    closePrice: price.closePrice,
    turnover: price.turnover,
    tradeDate: price.tradeDate,
    unitNav: nav?.unitNav ?? null,
    navDate: nav?.navDate ?? null,
    iopv: estimate?.iopv ?? null,
    iopvTime: estimate?.iopvTime ?? null,
    iopvPremiumDiscountRate: calculateIopvPremiumDiscount(price.closePrice, estimate?.iopv),
    closingPremiumDiscountRate: calculateClosingPremiumDiscount({
      closePrice: price.closePrice,
      unitNav: nav?.unitNav ?? 0,
      tradeDate: price.tradeDate,
      navDate: nav?.navDate ?? ""
    }),
    source: price.source,
    syncRunId: price.syncRunId
  };
}

async function fetchSpotQuoteMap(
  fetchImpl: typeof fetch,
  funds: Fund[],
  dataDate: string,
  timeoutMs: number
): Promise<Map<string, SpotQuote>> {
  if (funds.length === 0) return new Map();
  const params = new URLSearchParams({
    fltt: "2",
    secids: funds.map((fund) => eastMoneySecid(fund.code)).join(","),
    fields: "f12,f14,f6,f18"
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
      const map = new Map<string, SpotQuote>();
      for (const quote of parseEastMoneySpotQuotes(await response.json(), dataDate)) {
        map.set(quote.fundCode, quote);
      }
      if (map.size > 0) return map;
    } catch {
      continue;
    }
  }
  return new Map();
}

async function fetchKline(fetchImpl: typeof fetch, code: string, beforeDate: string, timeoutMs?: number): Promise<KlineLatest> {
  const params = new URLSearchParams({
    secid: eastMoneySecid(code),
    ut: "fa5fd1943c7b386f172d6893dbfba10b",
    fields1: "f1,f2,f3,f4,f5,f6",
    fields2: "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
    klt: "101",
    fqt: "1",
    end: "20500101",
    lmt: "2"
  });
  const response = await fetchWithTimeout(
    fetchImpl,
    `https://push2his.eastmoney.com/api/qt/stock/kline/get?${params.toString()}`,
    { headers: { "User-Agent": "Mozilla/5.0 ETFLimit/0.1", Referer: "https://fund.eastmoney.com/" } },
    timeoutMs
  );
  if (!response.ok) throw new Error(`kline returned ${response.status}`);
  return parseEastMoneyKlineLatest(await response.json(), beforeDate);
}

async function fetchNav(fetchImpl: typeof fetch, code: string, timeoutMs?: number): Promise<NavLatest> {
  const params = new URLSearchParams({ type: "lsjz", code, page: "1", per: "3" });
  const response = await fetchWithTimeout(
    fetchImpl,
    `https://fundf10.eastmoney.com/F10DataApi.aspx?${params.toString()}`,
    { headers: { "User-Agent": "Mozilla/5.0 ETFLimit/0.1", Referer: "https://fundf10.eastmoney.com/" } },
    timeoutMs
  );
  if (!response.ok) throw new Error(`nav returned ${response.status}`);
  return parseEastMoneyNavLatest(await response.text());
}

async function safeFetchNav(fetchImpl: typeof fetch, code: string, timeoutMs?: number): Promise<NavLatest | null> {
  try {
    return await fetchNav(fetchImpl, code, timeoutMs);
  } catch {
    return null;
  }
}

async function resolveNav(fetchImpl: typeof fetch, code: string, estimate: FundEstimate | null, timeoutMs?: number): Promise<NavLatest | null> {
  const nav = await safeFetchNav(fetchImpl, code, timeoutMs);
  if (nav) return nav;
  if (estimate?.unitNav != null && estimate.navDate) {
    return { unitNav: estimate.unitNav, navDate: estimate.navDate };
  }
  return null;
}

function decodeEscapedHtml(value: string): string {
  return value.replace(/\\"/g, "\"").replace(/\\'/g, "'").replace(/\\\//g, "/");
}

function normalizeText(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function previousCalendarDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}
