import { describe, expect, it } from "vitest";
import { CATALOG_DIRECT_SHARE_FUNDS, CATALOG_FUNDS, INDEX_FUND_CATALOG, INDEX_TARGET_ANCHOR_SEEDS } from "./fundCatalog";

describe("fund catalog", () => {
  const structural = INDEX_FUND_CATALOG.NASDAQ_100;

  it("keeps only structural Nasdaq entries (I/F direct shares and cross-listed LOFs)", () => {
    expect(structural.filter((fund) => fund.venue === "on_exchange" && fund.shareClass === "ETF")).toHaveLength(0);
    expect(structural).toContainEqual(expect.objectContaining({ code: "021000", shareClass: "I" }));
    expect(structural).toContainEqual(expect.objectContaining({ code: "161130", shareClass: "LOF", parentFundCode: "159696" }));
  });

  it("links direct I shares to their feeder parent ETF", () => {
    expect(structural).toContainEqual(expect.objectContaining({ code: "021838", shareClass: "I", parentFundCode: "159501" }));
    expect(structural).toContainEqual(expect.objectContaining({ code: "021778", shareClass: "F", parentFundCode: "159941" }));
  });

  it("marks every catalog fund enabled with a tracking target", () => {
    for (const fund of CATALOG_FUNDS) {
      expect(fund.enabled).toBe(true);
      expect(fund.trackingTargetCode).toBeTruthy();
    }
  });

  it("exposes anchor seed codes per target", () => {
    expect(INDEX_TARGET_ANCHOR_SEEDS.NASDAQ_100).toEqual(expect.arrayContaining(["513100", "159632"]));
    expect(INDEX_TARGET_ANCHOR_SEEDS.NIKKEI_225).toContain("513880");
  });

  it("includes curated I/F direct-share funds", () => {
    expect(CATALOG_DIRECT_SHARE_FUNDS.map((fund) => fund.code)).toEqual(
      expect.arrayContaining(["021000", "021778", "021838", "022664", "024237"])
    );
  });

  it("has no duplicate fund codes", () => {
    const codes = CATALOG_FUNDS.map((fund) => fund.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
