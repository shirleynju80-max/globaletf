import { describe, expect, it, vi } from "vitest";
import { parseEastMoneyFundSearch } from "./eastmoneyFundSearch";
import { discoverStockScanFunds, stockScanSearchQueries } from "./stockHoldingFundDiscovery";

const sampleScript = `var r = [
  ["539002","JXXXSCSCSHH(QDII)A","建信新兴市场混合(QDII)A","QDII-混合偏股","JIANXIN"],
  ["000834","DCNSDK100ETFLJQDIIA","大成纳斯达克100ETF联接(QDII)A","指数型-海外股票","DACHENG"],
  ["006308","HXQQKJ(QDII)","华夏全球科技先锋混合(QDII)","QDII-混合偏股","HUAXIA"]
];`;

describe("stockHoldingFundDiscovery", () => {
  it("builds broad QDII name queries without stock ticker keywords", () => {
    expect(stockScanSearchQueries()).toEqual([
      "QDII混合",
      "QDII股票",
      "全球精选",
      "新兴市场",
      "全球科技",
      "半导体"
    ]);
  });

  it("discovers active non-index QDII funds from fundcode search and suggestions", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("fundcode_search.js")) return new Response(sampleScript, { status: 200 });
      if (url.includes("FundSearchAPI.ashx")) {
        return new Response(JSON.stringify({
          Datas: [{
            CODE: "006308",
            NAME: "华夏全球科技先锋混合(QDII)",
            JP: "HX",
            FundBaseInfo: { FTYPE: "QDII-混合偏股", JJGS: "华夏基金" }
          }]
        }), { status: 200 });
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;

    const funds = await discoverStockScanFunds({ fetchImpl });

    expect(funds.map((fund) => fund.code)).toEqual(["006308", "539002"]);
    expect(funds.every((fund) => fund.trackingTargetCode == null)).toBe(true);
    expect(parseEastMoneyFundSearch(sampleScript).length).toBeGreaterThan(0);
  });
});
