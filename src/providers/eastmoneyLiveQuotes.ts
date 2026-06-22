import { parseBeijingTimeMs, resolveIopvPremium, type IopvPoint } from "../domain/iopvAlignment";
import { calculateIopvPremiumDiscount } from "../domain/quotes";
import { fetchFundReferenceEstimate } from "./fundReferenceEstimate";
import {
  fetchEastMoneyQuoteListMap,
  iopvTimeFromQuoteSnapshot,
  mergeQuoteListIopv,
  parseEastMoneyQuoteListRows
} from "./eastmoneyQuoteList";
import { mapConcurrent } from "./requestUtils";

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

export function parseLivePrices(payload: unknown): Map<string, LivePrice> {
  const map = new Map<string, LivePrice>();
  for (const row of parseEastMoneyQuoteListRows(payload)) {
    if (row.lastPrice == null) continue;
    map.set(row.fundCode, { price: row.lastPrice, priceTimeMs: row.priceTimeMs });
  }
  return map;
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
  const quoteListByCode = await fetchEastMoneyQuoteListMap(fetchImpl, codes, timeoutMs);
  const fallbacks = await mapConcurrent(codes, 6, (code) => fetchFundReferenceEstimate(fetchImpl, code, timeoutMs));

  return codes.map((code, index) => {
    const quoteRow = quoteListByCode.get(code) ?? null;
    const tradeDate = options.tradeDateByCode?.get(code) ?? null;

    // East Money app pairs f2 and f441 from the same quote-list snapshot — use directly.
    if (quoteRow?.lastPrice != null && quoteRow.iopv != null) {
      const iopvTime = iopvTimeFromQuoteSnapshot(quoteRow.priceTimeMs, tradeDate ?? undefined);
      return {
        fundCode: code,
        price: quoteRow.lastPrice,
        priceTime: quoteRow.priceTimeMs != null ? new Date(quoteRow.priceTimeMs).toISOString() : null,
        iopv: quoteRow.iopv,
        iopvTime,
        iopvPremiumDiscountRate: calculateIopvPremiumDiscount(quoteRow.lastPrice, quoteRow.iopv),
        aligned: true,
        iopvSource: "current" as const
      };
    }

    const livePrice = quoteRow?.lastPrice != null
      ? { price: quoteRow.lastPrice, priceTimeMs: quoteRow.priceTimeMs }
      : null;
    const reference = mergeQuoteListIopv(quoteRow, fallbacks[index], tradeDate);
    const resolved = resolveIopvPremium({
      price: livePrice?.price ?? null,
      priceTimeMs: livePrice?.priceTimeMs ?? null,
      tradeDate,
      current: reference ? { iopv: reference.iopv, iopvTime: reference.iopvTime } : null,
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
