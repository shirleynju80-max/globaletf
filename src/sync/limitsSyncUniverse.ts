import { isOtcPurchaseLimitFund } from "../domain/purchaseLimits";
import type { Fund } from "../domain/types";

/** Merge product funds with supplemental OTC-limit candidates (e.g. holdings-discovered LOFs). */
export function mergeFundsForLimitsSync(productFunds: Fund[], supplementalFunds: Fund[]): Fund[] {
  const byCode = new Map(productFunds.map((fund) => [fund.code, fund]));
  for (const fund of supplementalFunds) {
    if (!isOtcPurchaseLimitFund(fund)) continue;
    const existing = byCode.get(fund.code);
    if (existing) {
      byCode.set(fund.code, { ...existing, enabled: existing.enabled || fund.enabled });
      continue;
    }
    byCode.set(fund.code, { ...fund, enabled: true });
  }
  return [...byCode.values()];
}
