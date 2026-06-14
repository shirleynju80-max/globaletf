import { describe, expect, it } from "vitest";
import { INDEX_TARGET_FUND_SEED_FUNDS, INDEX_TARGET_FUND_SEEDS, STOCK_TARGETS, TARGETS, findTargetByCode } from "./targets";

describe("targets", () => {
  it("contains the first release overseas index targets", () => {
    expect(TARGETS.map((target) => target.code)).toEqual(
      expect.arrayContaining(["NASDAQ_100", "SP_500", "NIKKEI_225", "HSTECH"])
    );
  });

  it("contains the first release popular stock targets", () => {
    expect(STOCK_TARGETS.map((target) => target.code)).toEqual(["NVDA", "AAPL", "MSFT", "TSLA", "META"]);
  });

  it("finds targets by code and alias", () => {
    expect(findTargetByCode("NASDAQ_100")?.code).toBe("NASDAQ_100");
    expect(findTargetByCode("nasdaq100")?.code).toBe("NASDAQ_100");
    expect(findTargetByCode("英伟达")?.code).toBe("NVDA");
  });

  it("keeps curated fund seeds for known index coverage gaps", () => {
    expect(INDEX_TARGET_FUND_SEEDS.NASDAQ_100).toContain("159632");
    expect(INDEX_TARGET_FUND_SEED_FUNDS).toContainEqual(expect.objectContaining({
      code: "159632",
      trackingTargetCode: "NASDAQ_100",
      venue: "on_exchange",
      shareClass: "ETF"
    }));
  });
});
