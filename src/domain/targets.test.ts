import { describe, expect, it } from "vitest";
import { INDEX_TARGET_FUND_SEED_FUNDS, INDEX_TARGET_FUND_SEEDS, STOCK_TARGETS, TARGETS, findTargetByCode } from "./targets";

describe("targets", () => {
  it("contains the first release overseas index targets", () => {
    expect(TARGETS.map((target) => target.code)).toEqual(
      expect.arrayContaining(["NASDAQ_100", "SP_500", "NIKKEI_225", "HSTECH", "KOSPI"])
    );
  });

  it("contains the first release popular stock targets", () => {
    expect(STOCK_TARGETS.map((target) => target.code)).toEqual([
      "NVDA", "AAPL", "GOOG", "MU", "AVGO", "AMD", "TSM", "HYNIX"
    ]);
  });

  it("finds targets by code and alias", () => {
    expect(findTargetByCode("NASDAQ_100")?.code).toBe("NASDAQ_100");
    expect(findTargetByCode("nasdaq100")?.code).toBe("NASDAQ_100");
    expect(findTargetByCode("英伟达")?.code).toBe("NVDA");
  });

  it("keeps anchor fund seeds for discovery bias", () => {
    expect(INDEX_TARGET_FUND_SEEDS.NASDAQ_100).toContain("159632");
    expect(INDEX_TARGET_FUND_SEED_FUNDS).toContainEqual(expect.objectContaining({
      code: "021000",
      trackingTargetCode: "NASDAQ_100",
      venue: "off_exchange",
      shareClass: "I"
    }));
  });
});
