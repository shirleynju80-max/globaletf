import { describe, expect, it } from "vitest";
import { defaultChannelIdForFund, defaultChannelScopeForShareClass } from "./purchaseLimits";

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
});
