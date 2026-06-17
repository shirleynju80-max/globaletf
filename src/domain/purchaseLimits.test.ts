import { describe, expect, it } from "vitest";
import { defaultChannelIdForFund, defaultChannelScopeForShareClass, isOtcPurchaseLimitFund } from "./purchaseLimits";
import type { Fund } from "./types";

describe("purchase limit share-class rules", () => {
  it("defaults A and C classes to agency scope", () => {
    expect(defaultChannelScopeForShareClass("A")).toBe("agency");
    expect(defaultChannelScopeForShareClass("C")).toBe("agency");
  });

  it("defaults F and I classes to direct scope", () => {
    expect(defaultChannelScopeForShareClass("F")).toBe("direct");
    expect(defaultChannelScopeForShareClass("I")).toBe("direct");
  });

  it("maps share classes to default channel ids", () => {
    expect(defaultChannelIdForFund("A")).toBe("eastmoney_aggregate");
    expect(defaultChannelIdForFund("I", "南方基金")).toBe("nfjj");
  });

  it("treats cross-listed LOF as OTC purchase-limit candidates", () => {
    const lof: Fund = {
      code: "161128",
      name: "易方达标普信息科技指数(QDII-LOF)A(人民币)",
      fundType: "QDII",
      venue: "on_exchange",
      shareClass: "LOF",
      enabled: true
    };
    expect(isOtcPurchaseLimitFund(lof)).toBe(true);
    expect(isOtcPurchaseLimitFund({ ...lof, shareClass: "ETF" })).toBe(false);
  });
});
