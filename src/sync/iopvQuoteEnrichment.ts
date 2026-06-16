import type Database from "better-sqlite3";
import { parseBeijingTimeMs, resolveIopvPremium, toIopvPoint, tradeDateCloseMs, type IopvPoint } from "../domain/iopvAlignment";
import type { FundEstimate } from "../providers/eastmoneyIopv";
import type { FundQuote } from "../domain/types";

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

export function enrichQuoteWithMatchedIopv(
  db: Database.Database,
  quote: FundQuote,
  estimate: FundEstimate | null,
  priceTimeMs: number | null
): FundQuote {
  const resolvedMs = priceTimeMs ?? tradeDateCloseMs(quote.tradeDate);
  const resolved = resolveIopvPremium({
    price: quote.closePrice,
    priceTimeMs: resolvedMs,
    tradeDate: quote.tradeDate,
    current: estimate ? { iopv: estimate.iopv, iopvTime: estimate.iopvTime } : { iopv: quote.iopv ?? null, iopvTime: quote.iopvTime ?? null },
    priorSnapshots: queryPriorIopvSnapshots(db, quote.fundCode)
  });

  return {
    ...quote,
    iopv: resolved.iopv,
    iopvTime: resolved.iopvTime,
    iopvPremiumDiscountRate: resolved.iopvPremiumDiscountRate,
    priceTime: resolved.priceTimeMs != null ? new Date(resolved.priceTimeMs).toISOString() : quote.priceTime ?? null,
    iopvAligned: resolved.aligned
  };
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
