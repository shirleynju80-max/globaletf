import type Database from "better-sqlite3";
import { parseBeijingTimeMs, resolveIopvPremium, toIopvPoint, tradeDateCloseMs, type IopvPoint } from "../domain/iopvAlignment";
import { calculateIopvPremiumDiscount } from "../domain/quotes";
import type { FundQuote } from "../domain/types";
import type { FundEstimate } from "../providers/eastmoneyIopv";
import { iopvTimeFromQuoteSnapshot, type EastMoneyQuoteListRow } from "../providers/eastmoneyQuoteList";

export const EASTMONEY_ON_EXCHANGE_QUOTE_SOURCE = "eastmoney-on-exchange-quote";

export function queryPriorIopvSnapshots(db: Database.Database, fundCode: string): IopvPoint[] {
  const rows = db.prepare(`
    SELECT DISTINCT iopv, iopv_time AS iopvTime
    FROM fund_quotes
    WHERE fund_code = ? AND iopv IS NOT NULL AND iopv_time IS NOT NULL
    ORDER BY iopv_time DESC
    LIMIT 20
  `).all(fundCode) as Array<{ iopv: number; iopvTime: string }>;

  return rows.flatMap((row) => {
    const point = toIopvPoint(row.iopv, row.iopvTime);
    return point ? [point] : [];
  });
}

export function normalizeOnExchangeQuoteSource(quote: FundQuote): FundQuote {
  if (quote.source === "eastmoney-on-exchange-spot") {
    return { ...quote, source: EASTMONEY_ON_EXCHANGE_QUOTE_SOURCE };
  }
  return quote;
}

/** Pair frozen session close (kline) with East Money quote-list IOPV (`f441`). */
export function pairSessionCloseWithQuoteListIopv(
  quote: FundQuote,
  quoteListRow: EastMoneyQuoteListRow | null | undefined
): FundQuote | null {
  if (quoteListRow?.iopv == null) return null;
  const sessionCloseMs = tradeDateCloseMs(quote.tradeDate);
  const iopvTime = iopvTimeFromQuoteSnapshot(quoteListRow.priceTimeMs, quote.tradeDate);
  const iopvPremiumDiscountRate = calculateIopvPremiumDiscount(quote.closePrice, quoteListRow.iopv);
  if (iopvPremiumDiscountRate == null || !iopvTime) return null;
  return {
    ...quote,
    iopv: quoteListRow.iopv,
    iopvTime,
    iopvPremiumDiscountRate,
    priceTime: sessionCloseMs != null ? new Date(sessionCloseMs).toISOString() : quote.priceTime ?? null,
    iopvAligned: true
  };
}

export function enrichQuoteWithMatchedIopv(
  db: Database.Database,
  quote: FundQuote,
  estimate: FundEstimate | null,
  priceTimeMs: number | null,
  quoteListRow?: EastMoneyQuoteListRow | null
): FundQuote {
  const fromQuoteList = pairSessionCloseWithQuoteListIopv(quote, quoteListRow);
  if (fromQuoteList) return fromQuoteList;

  // Quote-list IOPV (non-04:00 gztime) is already paired with the session price in sync.
  if (!estimate && quote.iopv != null && quote.iopvPremiumDiscountRate != null && quote.iopvTime && !quote.iopvTime.endsWith(" 04:00")) {
    return quote;
  }

  const priorRate = quote.iopvPremiumDiscountRate;
  const resolvedMs = priceTimeMs ?? tradeDateCloseMs(quote.tradeDate);
  const resolved = resolveIopvPremium({
    price: quote.closePrice,
    priceTimeMs: resolvedMs,
    tradeDate: quote.tradeDate,
    current: estimate ? { iopv: estimate.iopv, iopvTime: estimate.iopvTime } : { iopv: quote.iopv ?? null, iopvTime: quote.iopvTime ?? null },
    priorSnapshots: queryPriorIopvSnapshots(db, quote.fundCode)
  });

  if (resolved.iopvPremiumDiscountRate != null) {
    return {
      ...quote,
      iopv: resolved.iopv,
      iopvTime: resolved.iopvTime,
      iopvPremiumDiscountRate: resolved.iopvPremiumDiscountRate,
      priceTime: resolved.priceTimeMs != null ? new Date(resolved.priceTimeMs).toISOString() : quote.priceTime ?? null,
      iopvAligned: resolved.aligned
    };
  }

  if (priorRate != null && quote.iopv != null && quote.iopvTime) {
    return {
      ...quote,
      iopvAligned: quote.iopvAligned ?? false
    };
  }

  return quote;
}

/** Store latest raw IOPV from a sync pass before it is written, for same-batch prior lookup. */
export function rememberIopvSnapshot(batch: IopvPoint[], estimate: FundEstimate | null): IopvPoint[] {
  if (!estimate?.iopv || !estimate.iopvTime) return batch;
  const point = toIopvPoint(estimate.iopv, estimate.iopvTime);
  if (!point) return batch;
  if (batch.some((row) => row.iopvTime === point.iopvTime)) return batch;
  return [point, ...batch];
}

export function priorSnapshotsBefore(batch: IopvPoint[], priceTimeMs: number | null): IopvPoint[] {
  if (priceTimeMs == null) return batch;
  return batch.filter((row) => row.iopvTimeMs < priceTimeMs || parseBeijingTimeMs(row.iopvTime)! <= priceTimeMs);
}
