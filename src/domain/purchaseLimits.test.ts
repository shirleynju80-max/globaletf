import { describe, expect, it } from "vitest";
import { defaultChannelScopeForShareClass } from "./purchaseLimits";

describe("purchase limit share-class rules", () => {
  it("defaults A and C classes to agency scope", () => {
    expect(defaultChannelScopeForShareClass("A")).toBe("agency");
    expect(defaultChannelScopeForShareClass("C")).toBe("agency");
  });

  it("defaults F class to direct scope", () => {
    expect(defaultChannelScopeForShareClass("F")).toBe("direct");
  });
});
