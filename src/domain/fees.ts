import type { FeeTier } from "./types";

export function selectDefaultSubscriptionRate(tiers: FeeTier[]): number | undefined {
  return tiers
    .filter((tier) => tier.feeType === "subscription")
    .sort((a, b) => (a.amountTierLowerBound ?? 0) - (b.amountTierLowerBound ?? 0))[0]?.rate;
}

export function summarizeRedemptionFees(tiers: FeeTier[]): string[] {
  return tiers
    .filter((tier) => tier.feeType === "redemption")
    .sort((a, b) => (a.minHoldingDays ?? 0) - (b.minHoldingDays ?? 0))
    .map((tier) => {
      const min = tier.minHoldingDays ?? 0;
      const max = tier.maxHoldingDays == null ? "以上" : `${tier.maxHoldingDays}`;
      return `${min}-${max}天: ${formatPercent(tier.rate, 1)}`;
    });
}

export function formatPercent(rate: number, fractionDigits = 2): string {
  return `${(rate * 100).toFixed(fractionDigits)}%`;
}
