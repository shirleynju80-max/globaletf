import { describe, expect, it, vi } from "vitest";
import type { Fund } from "../domain/types";
import { createEastMoneyOnExchangeQuoteProvider, eastMoneySecid, parseEastMoneyKlineLatest, parseEastMoneyNavLatest, parseEastMoneySpotQuotes, safeFetchPreviousDayKline } from "./eastmoneyOnExchangeQuotes";

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
    const rows = parseEastMoneySpotQuotes(spotPayload, "2026-06-10");
    expect(rows[0]).toMatchObject({ fundCode: "159513", closePrice: 1.802, turnover: 108316295.612, tradeDate: "2026-06-09" });
    expect(rows[1]).toMatchObject({ fundCode: "513390", closePrice: 2.422, turnover: 64897873, tradeDate: "2026-06-09" });
  });
});

function respond(value: string | number | undefined): Response {
  if (value === undefined) return new Response("missing", { status: 404 });
  if (typeof value === "number") return new Response("error", { status: value });
  return new Response(value, { status: 200 });
}

function routeFetch(routes: { kline?: string | number; nav?: string | number; spot?: string | number; estimate?: string | number }) {
  return vi.fn(async (url: Parameters<typeof fetch>[0]) => {
    const u = String(url);
    if (u.includes("stock/kline")) return respond(routes.kline);
    if (u.includes("fundgz.1234567.com.cn")) return respond(routes.estimate);
    if (u.includes("ulist.np")) return respond(routes.spot);
    if (u.includes("F10DataApi.aspx")) return respond(routes.nav);
    return new Response("not found", { status: 404 });
  }) as unknown as ReturnType<typeof vi.fn>;
}

function calledUrls(fetchImpl: ReturnType<typeof vi.fn>): string[] {
  return fetchImpl.mock.calls.map((call) => String(call[0]));
}

const klineJson = JSON.stringify(klinePayload);
const spotJson = JSON.stringify(spotPayload);
const iopvPayload = `jsonpgz({"fundcode":"159513","jzrq":"2026-06-08","dwjz":"1.2000","gsz":"1.1500","gszzl":"0.5","gztime":"2026-06-10 04:00"});`;

describe("East Money previous-day kline fetch", () => {
  it("retries the primary kline host after a transient failure", async () => {
    let klineCalls = 0;
    const fetchImpl = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      if (String(url).includes("stock/kline")) {
        klineCalls += 1;
        if (klineCalls < 2) return new Response("error", { status: 502 });
        return respond(klineJson);
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const row = await safeFetchPreviousDayKline(fetchImpl, "159513", "2026-06-10", 5_000);

    expect(row).toMatchObject({ closePrice: 1.23, turnover: 56000000, tradeDate: "2026-06-09" });
    expect(klineCalls).toBe(2);
  });

  it("falls back to an alternate kline host after primary retries fail", async () => {
    const fetchImpl = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      const target = String(url);
      if (target.includes("stock/kline") && target.startsWith("https://push2his.eastmoney.com")) {
        return new Response("error", { status: 502 });
      }
      if (target.includes("stock/kline") && target.startsWith("http://push2his.eastmoney.com")) {
        return respond(klineJson);
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const row = await safeFetchPreviousDayKline(fetchImpl, "159513", "2026-06-10", 5_000);

    expect(row).toMatchObject({ closePrice: 1.23, turnover: 56000000, tradeDate: "2026-06-09" });
    expect(fetchImpl.mock.calls.some((call) => String(call[0]).startsWith("http://push2his.eastmoney.com"))).toBe(true);
  });
});

describe("East Money on-exchange quote provider", () => {
  it("fetches kline and same-date NAV to calculate previous-close premium", async () => {
    const fetchImpl = routeFetch({ kline: klineJson, nav: navPayload });
    const provider = createEastMoneyOnExchangeQuoteProvider([onExchangeFunds[0]], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      dataDate: "2026-06-10",
      syncRunId: "run-1"
    });

    const result = await provider.fetch();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const urls = calledUrls(fetchImpl);
    expect(urls.some((u) => u.includes("secid=0.159513") && u.includes("ut=fa5fd1943c7b386f172d6893dbfba10b"))).toBe(true);
    expect(urls.some((u) => u.includes("code=159513"))).toBe(true);
    expect(result.data[0]).toMatchObject({
      fundCode: "159513",
      closePrice: 1.23,
      turnover: 56000000,
      tradeDate: "2026-06-09",
      source: "eastmoney-on-exchange-quote"
    });
    expect(result.data[0].closingPremiumDiscountRate).toBeCloseTo(0.025);
  });

  it("computes the IOPV premium against quote-list f441 when available", async () => {
    const spotWithIopv = JSON.stringify({
      data: {
        diff: [{ f12: "159513", f2: 1.23, f18: 1.2, f441: 1.15, f124: Math.floor(Date.UTC(2026, 5, 9, 7, 0) / 1000) }]
      }
    });
    const fetchImpl = routeFetch({ kline: klineJson, nav: navPayload, spot: spotWithIopv });
    const provider = createEastMoneyOnExchangeQuoteProvider([onExchangeFunds[0]], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      dataDate: "2026-06-10",
      syncRunId: "run-1"
    });

    const result = await provider.fetch();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0].iopv).toBe(1.15);
    expect(result.data[0].iopvPremiumDiscountRate).toBeCloseTo(0.0696, 3);
  });

  it("computes the IOPV premium against fundgz when f441 is missing", async () => {
    const fetchImpl = routeFetch({ kline: klineJson, nav: navPayload, estimate: iopvPayload });
    const provider = createEastMoneyOnExchangeQuoteProvider([onExchangeFunds[0]], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      dataDate: "2026-06-10",
      syncRunId: "run-1"
    });

    const result = await provider.fetch();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // close 1.23 vs IOPV 1.15 -> ~6.96% premium
    expect(result.data[0].iopv).toBe(1.15);
    expect(result.data[0].iopvTime).toBe("2026-06-10 04:00");
    expect(result.data[0].iopvPremiumDiscountRate).toBeCloseTo(0.0696, 3);
  });

  it("calculates quote premium with latest disclosed NAV when NAV date lags", async () => {
    const staleNavPayload = `var apidata={content:"<table><tbody><tr><td>2026-06-08</td><td>1.2000</td></tr></tbody></table>",records:1};`;
    const fetchImpl = routeFetch({ kline: klineJson, nav: staleNavPayload });
    const provider = createEastMoneyOnExchangeQuoteProvider([onExchangeFunds[0]], { fetchImpl: fetchImpl as unknown as typeof fetch, syncRunId: "run-1" });

    const result = await provider.fetch();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0]).toMatchObject({
      closingPremiumDiscountRate: expect.any(Number),
      unitNav: 1.2,
      navDate: "2026-06-08"
    });
    expect(result.data[0].closingPremiumDiscountRate).toBeCloseTo(0.025);
  });

  it("keeps close and turnover when NAV fetch fails", async () => {
    const fetchImpl = routeFetch({ kline: klineJson, nav: 403 });
    const provider = createEastMoneyOnExchangeQuoteProvider([onExchangeFunds[0]], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
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

  it("falls back to spot for individual funds when only their kline fetch fails", async () => {
    const fetchImpl = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      const u = String(url);
      if (u.includes("stock/kline") && u.includes("513390")) return new Response("error", { status: 502 });
      if (u.includes("stock/kline")) return respond(klineJson);
      if (u.includes("ulist.np")) return respond(spotJson);
      if (u.includes("fundgz.1234567.com.cn")) return respond(iopvPayload);
      if (u.includes("F10DataApi.aspx")) return respond(navPayload);
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const provider = createEastMoneyOnExchangeQuoteProvider(onExchangeFunds, {
      fetchImpl,
      dataDate: "2026-06-10",
      syncRunId: "run-1"
    });

    const result = await provider.fetch();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(2);
    expect(result.data.find((row) => row.fundCode === "159513")?.source).toBe("eastmoney-on-exchange-quote");
    expect(result.data.find((row) => row.fundCode === "513390")).toMatchObject({
      source: "eastmoney-on-exchange-spot",
      turnover: undefined
    });
    expect(result.source).toBe("eastmoney-on-exchange-quote+eastmoney-on-exchange-spot");
  });

  it("falls back to batch spot previous close when historical kline source is unavailable", async () => {
    const fetchImpl = routeFetch({
      kline: 502,
      spot: spotJson,
      nav: `var apidata={content:"<table><tbody><tr><td>2026-06-09</td><td>1.8000</td></tr></tbody></table>",records:1};`
    });
    const provider = createEastMoneyOnExchangeQuoteProvider([onExchangeFunds[0]], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      dataDate: "2026-06-10",
      syncRunId: "run-1"
    });

    const result = await provider.fetch();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const urls = calledUrls(fetchImpl);
    expect(urls.some((u) => u.includes("push2.eastmoney.com/api/qt/ulist.np/get"))).toBe(true);
    expect(urls.some((u) => u.includes("code=159513"))).toBe(true);
    expect(result.data[0]).toMatchObject({
      fundCode: "159513",
      closePrice: 1.802,
      turnover: undefined,
      tradeDate: "2026-06-09",
      source: "eastmoney-on-exchange-spot"
    });
    expect(result.data[0].closingPremiumDiscountRate).toBeCloseTo(0.0011, 4);
    expect(result.source).toBe("eastmoney-on-exchange-spot");
  });
});
