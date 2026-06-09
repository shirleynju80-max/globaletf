import { describe, expect, it } from "vitest";
import type { FeeTier } from "./types";
import { selectDefaultSubscriptionRate, summarizeRedemptionFees } from "./fees";

describe("fee helpers", () => {
  const tiers: FeeTier[] = [
    { fundCode: "000001", feeType: "subscription", rate: 0.0015, amountTierLowerBound: 0, amountTierUpperBound: 1000000, channelScope: "agency", source: "tiantian", dataDate: "2026-06-09", syncRunId: "run-1" },
    { fundCode: "000001", feeType: "subscription", rate: 0.001, amountTierLowerBound: 1000000, channelScope: "agency", source: "tiantian", dataDate: "2026-06-09", syncRunId: "run-1" },
    { fundCode: "000001", feeType: "redemption", rate: 0.015, minHoldingDays: 0, maxHoldingDays: 6, channelScope: "agency", source: "tiantian", dataDate: "2026-06-09", syncRunId: "run-1" },
    { fundCode: "000001", feeType: "redemption", rate: 0.005, minHoldingDays: 7, maxHoldingDays: 29, channelScope: "agency", source: "tiantian", dataDate: "2026-06-09", syncRunId: "run-1" }
  ];

  it("uses the lowest purchase amount tier for default subscription display", () => {
    expect(selectDefaultSubscriptionRate(tiers)).toBe(0.0015);
  });

  it("summarizes redemption fees by holding-day tiers", () => {
    expect(summarizeRedemptionFees(tiers)).toEqual(["0-6天: 1.50%", "7-29天: 0.50%"]);
  });
});
