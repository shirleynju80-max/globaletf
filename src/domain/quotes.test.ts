import { describe, expect, it } from "vitest";
import { calculateClosingPremiumDiscount, calculateIopvPremiumDiscount } from "./quotes";

describe("calculateClosingPremiumDiscount", () => {
  it("calculates previous-close premium when trade date and NAV date match", () => {
    expect(calculateClosingPremiumDiscount({ closePrice: 1.23, unitNav: 1.2, tradeDate: "2026-06-08", navDate: "2026-06-08" })).toBeCloseTo(0.025);
  });

  it("calculates previous-close premium with the latest disclosed NAV when NAV lags trade date", () => {
    expect(calculateClosingPremiumDiscount({ closePrice: 1.23, unitNav: 1.2, tradeDate: "2026-06-08", navDate: "2026-06-07" })).toBeCloseTo(0.025);
  });

  it("does not calculate with a future NAV date", () => {
    expect(calculateClosingPremiumDiscount({ closePrice: 1.23, unitNav: 1.2, tradeDate: "2026-06-08", navDate: "2026-06-09" })).toBeNull();
  });

  it("does not calculate when NAV is zero or invalid", () => {
    expect(calculateClosingPremiumDiscount({ closePrice: 1.23, unitNav: 0, tradeDate: "2026-06-08", navDate: "2026-06-08" })).toBeNull();
    expect(calculateClosingPremiumDiscount({ closePrice: Number.NaN, unitNav: 1.2, tradeDate: "2026-06-08", navDate: "2026-06-08" })).toBeNull();
  });
});

describe("calculateIopvPremiumDiscount", () => {
  it("computes premium of price against the real-time IOPV", () => {
    // 159632: price 2.458 vs IOPV 2.2866 -> ~7.5% premium
    expect(calculateIopvPremiumDiscount(2.458, 2.2866)).toBeCloseTo(0.0749, 3);
  });

  it("computes a discount when price is below IOPV", () => {
    expect(calculateIopvPremiumDiscount(1.18, 1.2)).toBeCloseTo(-0.0167, 3);
  });

  it("returns null when price or IOPV is missing or invalid", () => {
    expect(calculateIopvPremiumDiscount(null, 1.2)).toBeNull();
    expect(calculateIopvPremiumDiscount(1.2, null)).toBeNull();
    expect(calculateIopvPremiumDiscount(1.2, 0)).toBeNull();
    expect(calculateIopvPremiumDiscount(Number.NaN, 1.2)).toBeNull();
  });
});
