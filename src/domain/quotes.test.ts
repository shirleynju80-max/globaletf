import { describe, expect, it } from "vitest";
import { calculateClosingPremiumDiscount } from "./quotes";

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
