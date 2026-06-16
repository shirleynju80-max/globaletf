import { describe, expect, it, vi } from "vitest";
import {
  createAgencyAugmentedFundDiscoveryProvider,
  mergeFundRowsByCode,
  mergeFundsByCode,
  parseAlipayFundSearch,
  parseCmbFundSearch,
  parseJdFundSearch,
  parseLicaitongFundSearch,
  uniqueDiscoveryQueries
} from "./agencyFundDiscovery";
import type { Fund } from "../domain/types";

describe("agencyFundDiscovery parsers", () => {
  it("parses Licaitong search rows", () => {
    expect(parseLicaitongFundSearch({
      fund_list: [{ fund_code: "159941", fund_name: "纳指ETF广发" }]
    })).toEqual([{
      code: "159941",
      name: "纳指ETF广发",
      shortName: "纳指ETF广发",
      type: "基金",
      pinyin: ""
    }]);
  });

  it("parses JD search rows", () => {
    expect(parseJdFundSearch({
      resultData: { datas: [{ fundCode: "513300", fundName: "纳斯达克ETF华夏" }] }
    })).toEqual([{
      code: "513300",
      name: "纳斯达克ETF华夏",
      shortName: "纳斯达克ETF华夏",
      type: "基金",
      pinyin: ""
    }]);
  });

  it("parses Alipay search rows", () => {
    expect(parseAlipayFundSearch({
      fundList: [{ productId: "159501", fundName: "纳指ETF嘉实" }]
    })).toEqual([{
      code: "159501",
      name: "纳指ETF嘉实",
      shortName: "纳指ETF嘉实",
      type: "基金",
      pinyin: ""
    }]);
  });

  it("parses CMB search rows", () => {
    expect(parseCmbFundSearch({
      body: { fundList: [{ fundCode: "513110", fundName: "纳指ETF华泰柏瑞" }] }
    })).toEqual([{
      code: "513110",
      name: "纳指ETF华泰柏瑞",
      shortName: "纳指ETF华泰柏瑞",
      type: "基金",
      pinyin: ""
    }]);
  });
});

describe("agencyFundDiscovery merge", () => {
  it("deduplicates fund rows by code", () => {
    const merged = mergeFundRowsByCode([
      { code: "159632", name: "纳斯达克ETF华安", shortName: "A", type: "指数型-海外股票", pinyin: "A" },
      { code: "159632", name: "", shortName: "B", type: "", pinyin: "B", fundCompany: "华安基金" }
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].fundCompany).toBe("华安基金");
  });

  it("prefers on-exchange venue when merging funds", () => {
    const merged = mergeFundsByCode([
      { code: "159941", name: "纳指ETF广发", fundType: "指数型-海外股票", venue: "off_exchange", shareClass: "A", enabled: true },
      { code: "159941", name: "纳指ETF广发", fundType: "指数型-海外股票", venue: "on_exchange", shareClass: "ETF", enabled: true }
    ] as Fund[]);
    expect(merged[0].venue).toBe("on_exchange");
    expect(merged[0].shareClass).toBe("ETF");
  });

  it("merges agency discovery rows into the base East Money provider", async () => {
    const baseProvider = {
      name: "eastmoney-fundcode-search",
      fetch: async () => ({
        ok: true as const,
        data: [{ code: "159632", name: "纳斯达克ETF华安", fundType: "指数型-海外股票", venue: "on_exchange" as const, shareClass: "ETF" as const, trackingTargetCode: "NASDAQ_100", enabled: true }],
        source: "eastmoney-fundcode-search",
        dataDate: "2026-06-15",
        confidence: 0.75
      })
    };
    const emptyScreener = JSON.stringify({ data: { diff: [], total: 0 } });
    const provider = createAgencyAugmentedFundDiscoveryProvider(baseProvider, {
      targets: [{ targetCode: "NASDAQ_100", targetName: "纳斯达克100", aliases: ["纳指100"], seedFundCodes: ["159941"] }],
      channels: ["alipay"],
      fetchImpl: vi.fn(async (url: Parameters<typeof fetch>[0]) => {
        const target = String(url);
        if (target.includes("alipay")) {
          return new Response(JSON.stringify({ fundList: [{ productId: "159941", fundName: "纳指ETF广发" }] }), { status: 200 });
        }
        if (target.includes("fundcode_search.js")) {
          return new Response("var r=[];", { status: 200 });
        }
        if (target.includes("clist/get")) {
          return new Response(emptyScreener, { status: 200 });
        }
        return new Response("{}", { status: 404 });
      }) as unknown as typeof fetch
    });

    const result = await provider.fetch();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((fund) => fund.code).sort()).toEqual(["159632", "159941"]);
  });
});
