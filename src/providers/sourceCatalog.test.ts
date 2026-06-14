import { describe, expect, it } from "vitest";
import { HOLDING_SOURCES, OFF_EXCHANGE_SOURCES, ON_EXCHANGE_SOURCES } from "./sourceCatalog";

describe("source catalog", () => {
  it("prioritizes Tiantian/East Money F10 pages for off-exchange limits and fees", () => {
    expect(OFF_EXCHANGE_SOURCES[0].name).toBe("tiantian-f10-jjfl");
    expect(OFF_EXCHANGE_SOURCES[0].endpointPattern).toContain("fundf10.eastmoney.com/jjfl_{code}.html");
    expect(OFF_EXCHANGE_SOURCES[0].parsingMode).toBe("html");
  });

  it("uses daily close plus latest disclosed NAV for on-exchange premium calculation", () => {
    expect(ON_EXCHANGE_SOURCES.map((source) => source.name)).toEqual([
      "akshare-eastmoney-etf-lof-hist",
      "akshare-eastmoney-open-fund-nav",
      "eastmoney-etf-spot-cross-check"
    ]);
    expect(ON_EXCHANGE_SOURCES[1].notes).toContain("latest disclosed NAV");
  });

  it("uses fund_portfolio_hold_em as the first holdings source", () => {
    expect(HOLDING_SOURCES[0].endpointPattern).toContain("fund_portfolio_hold_em");
  });
});
