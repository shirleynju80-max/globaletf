import type { Fund } from "../domain/types";

/** Merge product funds with the QDII holdings-scan catalog for F10 jjcc pulls. */
export function mergeFundsForHoldingsSync(productFunds: Fund[], qdiiScanFunds: Fund[]): Fund[] {
  const byCode = new Map(productFunds.map((fund) => [fund.code, fund]));
  for (const scanFund of qdiiScanFunds) {
    const existing = byCode.get(scanFund.code);
    if (existing) {
      byCode.set(scanFund.code, { ...existing, enabled: existing.enabled || scanFund.enabled });
      continue;
    }
    byCode.set(scanFund.code, { ...scanFund, enabled: true });
  }
  return [...byCode.values()];
}
