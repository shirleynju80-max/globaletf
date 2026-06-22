import { describe, expect, it } from "vitest";
import { codesMissingLivePremium, mergeLivePremiumMap, mergeLivePremiumRow } from "./livePremiumRefresh";

describe("livePremiumRefresh", () => {
  it("keeps an existing premium when a later refresh still lacks IOPV", () => {
    const existing = {
      fundCode: "513100",
      name: null,
      price: 1.5,
      priceTime: "2026-06-16T03:00:00.000Z",
      iopv: 1.4,
      iopvTime: "2026-06-16 14:00",
      iopvPremiumDiscountRate: 0.0714,
      aligned: true,
      iopvSource: "current" as const
    };
    const incoming = {
      ...existing,
      price: 1.52,
      iopv: null,
      iopvTime: null,
      iopvPremiumDiscountRate: null,
      aligned: null,
      iopvSource: "none" as const
    };

    expect(mergeLivePremiumRow(existing, incoming)).toMatchObject({
      price: 1.52,
      iopvPremiumDiscountRate: 0.0714,
      iopv: 1.4
    });
  });

  it("detects funds still missing both live and snapshot premiums", () => {
    const missing = codesMissingLivePremium(
      [
        { code: "513100", iopvPremiumDiscountRate: 0.05 },
        { code: "159632", iopvPremiumDiscountRate: null }
      ],
      {
        "159632": {
          fundCode: "159632",
          name: null,
          price: 2.3,
          priceTime: null,
          iopv: null,
          iopvTime: null,
          iopvPremiumDiscountRate: null,
          aligned: null,
          iopvSource: "none"
        }
      }
    );

    expect(missing).toEqual(["159632"]);
  });

  it("merges rows into the live premium map", () => {
    const merged = mergeLivePremiumMap({}, [{
      fundCode: "513100",
      name: null,
      price: 1.5,
      priceTime: null,
      iopv: 1.4,
      iopvTime: "2026-06-16 14:00",
      iopvPremiumDiscountRate: 0.0714,
      aligned: true,
      iopvSource: "current"
    }]);

    expect(merged["513100"].iopvPremiumDiscountRate).toBeCloseTo(0.0714);
  });
});
