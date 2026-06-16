import { describe, expect, it } from "vitest";
import { expandFundFamilyShareClasses, linkFeederParentEtfs, normalizeFundFamilyKey } from "./fundFamily";
import type { Fund } from "./types";

describe("fundFamily", () => {
  it("strips share-class suffixes for family grouping", () => {
    expect(normalizeFundFamilyKey("华夏纳斯达克100ETF联接(QDII)A")).toBe("华夏纳斯达克100ETF联接QDII");
    expect(normalizeFundFamilyKey("华夏纳斯达克100ETF联接(QDII)I")).toBe("华夏纳斯达克100ETF联接QDII");
  });

  it("expands sibling share classes when one class is discovered", () => {
    const discovered: Fund[] = [{
      code: "000834",
      name: "大成纳斯达克100ETF联接(QDII)A",
      fundType: "QDII",
      venue: "off_exchange",
      shareClass: "A",
      trackingTargetCode: "NASDAQ_100",
      enabled: true,
      discoverySource: "fundcode-search"
    }];
    const rows = [
      { code: "000834", name: "大成纳斯达克100ETF联接(QDII)A", shortName: "A", type: "QDII", pinyin: "A" },
      { code: "021000", name: "大成纳斯达克100ETF联接(QDII)I", shortName: "I", type: "QDII", pinyin: "I", fundCompany: "大成基金" }
    ];
    const expanded = expandFundFamilyShareClasses(discovered, rows, []);
    expect(expanded.map((fund) => fund.code)).toEqual(["021000"]);
    expect(expanded[0].discoverySource).toBe("fund-family");
  });

  it("links off-exchange feeders to on-exchange ETF parents by company", () => {
    const funds: Fund[] = [
      { code: "513100", name: "纳指ETF", fundType: "ETF", venue: "on_exchange", shareClass: "ETF", trackingTargetCode: "NASDAQ_100", fundCompany: "国泰基金", enabled: true },
      { code: "000834", name: "纳指联接A", fundType: "QDII", venue: "off_exchange", shareClass: "A", trackingTargetCode: "NASDAQ_100", fundCompany: "国泰基金", enabled: true }
    ];
    const linked = linkFeederParentEtfs(funds);
    expect(linked.find((fund) => fund.code === "000834")?.parentFundCode).toBe("513100");
  });
});
