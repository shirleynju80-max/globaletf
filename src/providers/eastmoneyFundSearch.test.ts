import { describe, expect, it, vi } from "vitest";
import { createEastMoneyFundSearchProvider, parseEastMoneyFundSearch, selectFundsForTarget } from "./eastmoneyFundSearch";

const sampleScript = `var r = [
  ["000834","DCNSDK100ETFLJQDIIA","大成纳斯达克100ETF联接(QDII)A","指数型-海外股票","DACHENG"],
  ["008971","DCNSDK100ETFLJQDIIC","大成纳斯达克100ETF联接(QDII)C","指数型-海外股票","DACHENG"],
  ["021778","GFNZ100ETFLJQDIIRMBF","广发纳指100ETF联接(QDII)人民币F","指数型-海外股票","GUANGFA"],
  ["016532","JSNSDK100ETFFQLJQDIIARMB","嘉实纳斯达克100ETF发起联接(QDII)A人民币","指数型-海外股票","JIASHI"],
  ["016533","JSNSDK100ETFFQLJQDIICRMB","嘉实纳斯达克100ETF发起联接(QDII)C人民币","指数型-海外股票","JIASHI"],
  ["159513","NSDK100ETFDC","纳斯达克100ETF大成","指数型-海外股票","DACHENG"],
  ["160213","GTNSDK100ZS","国泰纳斯达克100指数","指数型-海外股票","GUOTAI"],
  ["000055","GFNSDK100ETFLJMYQDIIA","广发纳斯达克100ETF联接美元(QDII)A","指数型-海外股票","GUANGFA"],
  ["000001","HXCZHH","华夏成长混合","混合型-灵活","HUAXIA"]
];`;

describe("East Money fund search parser", () => {
  it("parses fundcode_search.js arrays", () => {
    const rows = parseEastMoneyFundSearch(sampleScript);

    expect(rows[0]).toEqual({
      code: "000834",
      name: "大成纳斯达克100ETF联接(QDII)A",
      type: "指数型-海外股票",
      pinyin: "DACHENG",
      shortName: "DCNSDK100ETFLJQDIIA"
    });
  });

  it("selects Nasdaq 100 A/C/F off-exchange funds and on-exchange products", () => {
    const funds = selectFundsForTarget(parseEastMoneyFundSearch(sampleScript), {
      targetCode: "NASDAQ_100",
      targetName: "纳斯达克100",
      aliases: ["纳指100", "纳斯达克100"]
    });

    expect(funds.map((fund) => [fund.code, fund.shareClass, fund.venue])).toEqual([
      ["000834", "A", "off_exchange"],
      ["008971", "C", "off_exchange"],
      ["016532", "A", "off_exchange"],
      ["016533", "C", "off_exchange"],
      ["021778", "F", "off_exchange"],
      ["159513", "ETF", "on_exchange"],
      ["160213", "LOF", "on_exchange"]
    ]);
    expect(funds.find((fund) => fund.code === "000055")).toBeUndefined();
  });
});

describe("East Money fund search provider", () => {
  it("fetches and maps target funds", async () => {
    const fetchImpl = vi.fn(async () => new Response(sampleScript, { status: 200 }));
    const provider = createEastMoneyFundSearchProvider({
      targetCode: "NASDAQ_100",
      targetName: "纳斯达克100",
      aliases: ["纳指100", "纳斯达克100"],
      fetchImpl
    });

    const result = await provider.fetch();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fetchImpl).toHaveBeenCalledWith("https://fund.eastmoney.com/js/fundcode_search.js", expect.objectContaining({ headers: expect.any(Object) }));
    expect(result.data.some((fund) => fund.code === "021778" && fund.shareClass === "F")).toBe(true);
  });
});
