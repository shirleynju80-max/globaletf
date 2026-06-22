/** Index tabs that stay disabled until at least one tracked fund exists in the database. */
export const INDEX_TARGETS_PENDING_UNTIL_FUNDS = new Set(["KOSPI"]);

export function indexTargetHasFunds(comparison: {
  onExchange: readonly unknown[];
  offExchange: readonly unknown[];
}): boolean {
  return comparison.onExchange.length + comparison.offExchange.length > 0;
}

export function isIndexTargetSelectable(targetCode: string, fundAvailability: Record<string, boolean>): boolean {
  if (!INDEX_TARGETS_PENDING_UNTIL_FUNDS.has(targetCode)) return true;
  return fundAvailability[targetCode] === true;
}
