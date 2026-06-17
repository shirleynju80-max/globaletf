import type { LivePremiumRow } from "../api/client";

export const LIVE_REFRESH_INTERVAL_MS = 90_000;
export const LIVE_MISSING_RETRY_DELAY_MS = 5_000;

interface ComparisonSnapshotRow {
  code: string;
  iopvPremiumDiscountRate?: number | null;
}

export function mergeLivePremiumRow(existing: LivePremiumRow | undefined, incoming: LivePremiumRow): LivePremiumRow {
  if (!existing) return incoming;
  if (incoming.iopvPremiumDiscountRate != null) return incoming;
  return {
    ...incoming,
    iopv: incoming.iopv ?? existing.iopv,
    iopvTime: incoming.iopvTime ?? existing.iopvTime,
    iopvPremiumDiscountRate: existing.iopvPremiumDiscountRate,
    iopvSource: existing.iopvSource,
    aligned: existing.aligned,
    price: incoming.price ?? existing.price,
    priceTime: incoming.priceTime ?? existing.priceTime
  };
}

export function mergeLivePremiumMap(
  previous: Record<string, LivePremiumRow>,
  rows: LivePremiumRow[]
): Record<string, LivePremiumRow> {
  const next = { ...previous };
  for (const row of rows) {
    next[row.fundCode] = mergeLivePremiumRow(previous[row.fundCode], row);
  }
  return next;
}

export function codesMissingLivePremium(
  onExchange: ComparisonSnapshotRow[],
  livePremiums: Record<string, LivePremiumRow>
): string[] {
  return onExchange
    .filter((row) => (livePremiums[row.code]?.iopvPremiumDiscountRate ?? row.iopvPremiumDiscountRate) == null)
    .map((row) => row.code);
}
