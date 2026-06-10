import { describe, expect, it } from "vitest";
import { STOCK_TARGETS, TARGETS, findTargetByCode } from "./targets";

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
});
