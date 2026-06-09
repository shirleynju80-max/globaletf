import { describe, expect, it } from "vitest";
import { calculateClosingPremiumDiscount } from "./quotes";

describe("calculateClosingPremiumDiscount", () => {
  it("calculates previous-close premium when trade date and NAV date match", () => {
    expect(calculateClosingPremiumDiscount({ closePrice: 1.23, unitNav: 1.2, tradeDate: "2026-06-08", navDate: "2026-06-08" })).toBeCloseTo(0.025);
  });

  it("does not fabricate a premium when NAV date does not match trade date", () => {
    expect(calculateClosingPremiumDiscount({ closePrice: 1.23, unitNav: 1.2, tradeDate: "2026-06-08", navDate: "2026-06-07" })).toBeNull();
  });

  it("does not calculate when NAV is zero or invalid", () => {
    expect(calculateClosingPremiumDiscount({ closePrice: 1.23, unitNav: 0, tradeDate: "2026-06-08", navDate: "2026-06-08" })).toBeNull();
    expect(calculateClosingPremiumDiscount({ closePrice: Number.NaN, unitNav: 1.2, tradeDate: "2026-06-08", navDate: "2026-06-08" })).toBeNull();
  });
});
