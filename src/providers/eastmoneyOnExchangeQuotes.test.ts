import { describe, expect, it, vi } from "vitest";
import type { Fund } from "../domain/types";
import { createEastMoneyOnExchangeQuoteProvider, eastMoneySecid, parseEastMoneyKlineLatest, parseEastMoneyNavLatest, parseEastMoneySpotQuotes } from "./eastmoneyOnExchangeQuotes";

const onExchangeFunds: Fund[] = [
  { code: "159513", name: "纳斯达克100ETF大成", fundType: "指数型-海外股票", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true },
  { code: "513390", name: "纳指100ETF博时", fundType: "指数型-海外股票", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true }
];

const klinePayload = {
  data: {
    klines: [
      "2026-06-08,1.180,1.200,1.210,1.170,100000,45000000",
      "2026-06-09,1.210,1.230,1.240,1.190,120000,56000000"
    ]
  }
};

const navPayload = `var apidata={content:"<table><tbody><tr><td>2026-06-09</td><td>1.2000</td><td>1.2000</td></tr></tbody></table>",records:1,pages:1,curpage:1};`;
const spotPayload = {
  data: {
    diff: [
      { f12: "159513", f14: "纳斯达克100ETF大成", f18: 1.802, f6: 108316295.612 },
      { f12: "513390", f14: "纳指100ETF博时", f18: 2.422, f6: 64897873 }
    ]
  }
};

describe("East Money on-exchange quote parser", () => {
  it("builds East Money market secids from fund code", () => {
    expect(eastMoneySecid("159513")).toBe("0.159513");
    expect(eastMoneySecid("160213")).toBe("0.160213");
    expect(eastMoneySecid("513390")).toBe("1.513390");
  });

  it("parses latest daily close and turnover from kline payload", () => {
    expect(parseEastMoneyKlineLatest(klinePayload)).toEqual({
      closePrice: 1.23,
      turnover: 56000000,
      tradeDate: "2026-06-09"
    });
  });

  it("uses the previous completed trading day before the sync date", () => {
    expect(parseEastMoneyKlineLatest({
      data: {
        klines: [
          "2026-06-09,1.210,1.230,1.240,1.190,120000,56000000",
          "2026-06-10,1.220,1.240,1.250,1.210,90000,45000000"
        ]
      }
    }, "2026-06-10")).toEqual({
      closePrice: 1.23,
      turnover: 56000000,
      tradeDate: "2026-06-09"
    });
  });

  it("parses latest official NAV from F10 net-value payload", () => {
    expect(parseEastMoneyNavLatest(navPayload)).toEqual({ navDate: "2026-06-09", unitNav: 1.2 });
  });

  it("parses spot previous close quotes as a fallback", () => {
    expect(parseEastMoneySpotQuotes(spotPayload, "2026-06-10")).toEqual([
      { fundCode: "159513", closePrice: 1.802, turnover: 108316295.612, tradeDate: "2026-06-09" },
      { fundCode: "513390", closePrice: 2.422, turnover: 64897873, tradeDate: "2026-06-09" }
    ]);
  });
});

describe("East Money on-exchange quote provider", () => {
  it("fetches kline and same-date NAV to calculate previous-close premium", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(klinePayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(navPayload, { status: 200 }));
    const provider = createEastMoneyOnExchangeQuoteProvider([onExchangeFunds[0]], {
      fetchImpl,
      dataDate: "2026-06-10",
      syncRunId: "run-1"
    });

    const result = await provider.fetch();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toContain("secid=0.159513");
    expect(fetchImpl.mock.calls[0][0]).toContain("ut=fa5fd1943c7b386f172d6893dbfba10b");
    expect(fetchImpl.mock.calls[1][0]).toContain("code=159513");
    expect(result.data[0]).toMatchObject({
      fundCode: "159513",
      closePrice: 1.23,
      turnover: 56000000,
      tradeDate: "2026-06-09",
      source: "eastmoney-on-exchange-quote"
    });
    expect(result.data[0].closingPremiumDiscountRate).toBeCloseTo(0.025);
  });

  it("keeps quote with null premium when NAV date does not match", async () => {
    const staleNavPayload = `var apidata={content:"<table><tbody><tr><td>2026-06-08</td><td>1.2000</td></tr></tbody></table>",records:1};`;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(klinePayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(staleNavPayload, { status: 200 }));
    const provider = createEastMoneyOnExchangeQuoteProvider([onExchangeFunds[0]], { fetchImpl, syncRunId: "run-1" });

    const result = await provider.fetch();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0].closingPremiumDiscountRate).toBeNull();
  });

  it("keeps close and turnover when NAV fetch fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(klinePayload), { status: 200 }))
      .mockResolvedValueOnce(new Response("blocked", { status: 403 }));
    const provider = createEastMoneyOnExchangeQuoteProvider([onExchangeFunds[0]], {
      fetchImpl,
      dataDate: "2026-06-10",
      syncRunId: "run-1"
    });

    const result = await provider.fetch();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0]).toMatchObject({
      fundCode: "159513",
      closePrice: 1.23,
      turnover: 56000000,
      closingPremiumDiscountRate: null
    });
  });

  it("falls back to batch spot previous close when historical kline source is unavailable", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("blocked", { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(spotPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(`var apidata={content:"<table><tbody><tr><td>2026-06-09</td><td>1.8000</td></tr></tbody></table>",records:1};`, { status: 200 }));
    const provider = createEastMoneyOnExchangeQuoteProvider([onExchangeFunds[0]], {
      fetchImpl,
      dataDate: "2026-06-10",
      syncRunId: "run-1"
    });

    const result = await provider.fetch();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[1][0]).toContain("push2.eastmoney.com/api/qt/ulist.np/get");
    expect(fetchImpl.mock.calls[2][0]).toContain("code=159513");
    expect(result.data[0]).toMatchObject({
      fundCode: "159513",
      closePrice: 1.802,
      turnover: 108316295.612,
      tradeDate: "2026-06-09",
      source: "eastmoney-on-exchange-spot"
    });
    expect(result.data[0].closingPremiumDiscountRate).toBeCloseTo(0.0011, 4);
    expect(result.source).toBe("eastmoney-on-exchange-spot");
  });
});
