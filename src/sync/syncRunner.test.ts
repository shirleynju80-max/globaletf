import { describe, expect, it, vi } from "vitest";
import { createInMemoryDatabase } from "../db/database";
import { queryIndexComparison, queryStockConcentration, querySyncStatus } from "../db/repositories";
import type { DataProvider } from "../providers/types";
import type { OffExchangeFeeLimitSnapshot } from "../providers/eastmoneyF10";
import type { Fund, FundHolding, FundQuote } from "../domain/types";
import { runDailySync } from "./syncRunner";

describe("sync runner", () => {
  it("discovers funds for every configured index target when live fund search is enabled", async () => {
    const db = createInMemoryDatabase();
    const fundCodeScript = `var r = [
      ["159513","NSDK100ETFDC","纳斯达克100ETF大成","指数型-海外股票","DACHENG"],
      ["159632","NSDKETFHA","纳斯达克ETF华安","指数型-海外股票","HUAAN"],
      ["513500","BP500ETF","标普500ETF","指数型-海外股票","BIAOPU"]
    ];`;
    const emptyScreener = JSON.stringify({ data: { diff: [], total: 0 } });
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.includes("fundcode_search.js")) {
        return new Response(fundCodeScript, { status: 200 });
      }
      if (url.includes("clist/get")) {
        return new Response(emptyScreener, { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("FundSearchAPI.ashx")) {
        return new Response(JSON.stringify({ Datas: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchImpl);

    try {
      await runDailySync(db, { useLiveProviders: true, areas: ["fund"] });
    } finally {
      vi.unstubAllGlobals();
    }

    expect(queryIndexComparison(db, "NASDAQ_100").onExchange.map((row) => row.code)).toEqual(expect.arrayContaining(["159513", "159632"]));
    expect(queryIndexComparison(db, "SP_500").onExchange.map((row) => row.code)).toContain("513500");
  });

  it("writes mock snapshots and keeps them queryable", async () => {
    const db = createInMemoryDatabase();
    await runDailySync(db);
    const result = queryIndexComparison(db, "NASDAQ_100");
    expect(result.onExchange.length).toBeGreaterThan(0);
    expect(result.offExchange.length).toBeGreaterThan(0);
  });

  it("stamps snapshot rows with one timestamped daily sync run id", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-11T03:04:05.000Z"));
    const db = createInMemoryDatabase();

    try {
      await runDailySync(db);
    } finally {
      vi.useRealTimers();
    }

    const rows = db.prepare(`
      SELECT sync_run_id AS syncRunId FROM fund_quotes
      UNION
      SELECT sync_run_id AS syncRunId FROM purchase_limits
      UNION
      SELECT sync_run_id AS syncRunId FROM fund_fees
      UNION
      SELECT sync_run_id AS syncRunId FROM fund_holdings
    `).all() as Array<{ syncRunId: string }>;

    expect(rows).toEqual([{ syncRunId: "daily-20260611T030405Z" }]);
  });

  it("uses off-exchange provider data when available", async () => {
    const db = createInMemoryDatabase();
    const provider: DataProvider<OffExchangeFeeLimitSnapshot> = {
      name: "test-f10",
      fetch: async () => ({
        ok: true,
        source: "test-f10",
        dataDate: "2026-06-09",
        confidence: 0.9,
        data: {
          limits: [{ fundCode: "000834", shareClass: "A", status: "limited", limitAmountYuan: 10, limitUnit: "per_day", channelScope: "agency", source: "test-f10", dataDate: "2026-06-09", confidence: 0.9, syncRunId: "run-1" }],
          fees: [{ fundCode: "000834", feeType: "subscription", rate: 0.0012, amountTierLowerBound: 0, amountTierUpperBound: 500000, channelScope: "agency", source: "test-f10", dataDate: "2026-06-09", syncRunId: "run-1" }]
        }
      })
    };

    await runDailySync(db, { offExchangeProviders: [provider] });
    const result = queryIndexComparison(db, "NASDAQ_100");
    const feeCount = db.prepare("SELECT COUNT(*) AS count FROM fund_fees WHERE source = 'test-f10'").get() as { count: number };

    expect(result.offExchange.find((row) => row.code === "000834")?.limitAmountYuan).toBe(10);
    expect(feeCount.count).toBe(1);
  });

  it("records per-stage elapsed duration on sync statuses", async () => {
    const db = createInMemoryDatabase();
    const funds: Fund[] = [
      { code: "513100", name: "纳指ETF", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true }
    ];
    const fundProvider: DataProvider<Fund[]> = {
      name: "test-funds",
      fetch: async () => ({ ok: true, source: "test-funds", dataDate: "2026-06-11", confidence: 0.9, data: funds })
    };
    const quoteProvider: DataProvider<FundQuote[]> = {
      name: "test-quotes",
      fetch: async () => ({ ok: true, source: "test-quotes", dataDate: "2026-06-10", confidence: 0.9, data: [] })
    };
    const offExchangeProvider: DataProvider<OffExchangeFeeLimitSnapshot> = {
      name: "test-f10",
      fetch: async () => ({ ok: true, source: "test-f10", dataDate: "2026-06-11", confidence: 0.9, data: { limits: [], fees: [] } })
    };
    const holdingProvider: DataProvider<FundHolding[]> = {
      name: "test-holdings",
      fetch: async () => ({ ok: true, source: "test-holdings", dataDate: "2026Q1", confidence: 0.9, data: [] })
    };
    const times = [0, 11, 11, 31, 31, 71, 71, 76];

    await runDailySync(db, {
      fundProviders: [fundProvider],
      quoteProviders: [quoteProvider],
      offExchangeProviders: [offExchangeProvider],
      holdingProviders: [holdingProvider],
      now: () => times.shift() ?? 76
    });
    const status = querySyncStatus(db);

    expect(status.fund?.durationMs).toBe(11);
    expect(status.quote?.durationMs).toBe(20);
    expect(status.purchaseLimit?.durationMs).toBe(40);
    expect(status.fee?.durationMs).toBe(40);
    expect(status.holding?.durationMs).toBe(5);
  });

  it("runs only the requested quote area", async () => {
    const db = createInMemoryDatabase();
    const funds: Fund[] = [
      { code: "513100", name: "纳指ETF", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true }
    ];
    const fundProvider: DataProvider<Fund[]> = {
      name: "test-funds",
      fetch: async () => ({ ok: true, source: "test-funds", dataDate: "2026-06-11", confidence: 0.9, data: funds })
    };
    const quoteProvider: DataProvider<FundQuote[]> = {
      name: "test-quotes",
      fetch: async () => ({
        ok: true,
        source: "test-quotes",
        dataDate: "2026-06-10",
        confidence: 0.9,
        data: [{ fundCode: "513100", closePrice: 1.3, closingPremiumDiscountRate: 0.01, turnover: 100, tradeDate: "2026-06-10", source: "test-quotes", syncRunId: "run-1" }]
      })
    };
    const offExchangeProvider = { name: "test-f10", fetch: vi.fn() } satisfies DataProvider<OffExchangeFeeLimitSnapshot>;
    const holdingProvider = { name: "test-holdings", fetch: vi.fn() } satisfies DataProvider<FundHolding[]>;

    await runDailySync(db, {
      areas: ["quote"],
      fundProviders: [fundProvider],
      quoteProviders: [quoteProvider],
      offExchangeProviders: [offExchangeProvider],
      holdingProviders: [holdingProvider]
    });

    const status = querySyncStatus(db);
    expect(status.quote).toMatchObject({ status: "ok", source: "test-quotes", itemCount: 1 });
    expect(status.purchaseLimit).toBeUndefined();
    expect(status.fee).toBeUndefined();
    expect(status.holding).toBeUndefined();
    expect(offExchangeProvider.fetch).not.toHaveBeenCalled();
    expect(holdingProvider.fetch).not.toHaveBeenCalled();
  });

  it("uses discovered fund universe for sync snapshots", async () => {
    const db = createInMemoryDatabase();
    const funds: Fund[] = [
      { code: "513100", name: "纳指ETF", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true },
      { code: "000834", name: "大成纳斯达克100ETF联接(QDII)A", fundType: "指数型-海外股票", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "A", enabled: true },
      { code: "016533", name: "嘉实纳斯达克100ETF发起联接(QDII)C人民币", fundType: "指数型-海外股票", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "C", enabled: true },
      { code: "021778", name: "广发纳指100ETF联接(QDII)人民币F", fundType: "指数型-海外股票", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "F", enabled: true }
    ];
    const fundProvider: DataProvider<Fund[]> = {
      name: "test-fund-search",
      fetch: async () => ({ ok: true, source: "test-fund-search", dataDate: "2026-06-09", confidence: 0.9, data: funds })
    };
    const offExchangeProvider: DataProvider<OffExchangeFeeLimitSnapshot> = {
      name: "test-f10",
      fetch: async () => ({
        ok: true,
        source: "test-f10",
        dataDate: "2026-06-09",
        confidence: 0.9,
        data: {
          limits: [
            { fundCode: "000834", shareClass: "A", status: "limited", limitAmountYuan: 10, limitUnit: "per_day", channelScope: "agency", source: "test-f10", dataDate: "2026-06-09", confidence: 0.9, syncRunId: "run-1" },
            { fundCode: "016533", shareClass: "C", status: "limited", limitAmountYuan: 100, limitUnit: "per_day", channelScope: "agency", source: "test-f10", dataDate: "2026-06-09", confidence: 0.9, syncRunId: "run-1" },
            { fundCode: "021778", shareClass: "F", status: "limited", limitAmountYuan: 10000, limitUnit: "per_day", channelScope: "direct", source: "test-f10", dataDate: "2026-06-09", confidence: 0.9, syncRunId: "run-1" }
          ],
          fees: []
        }
      })
    };

    await runDailySync(db, { fundProviders: [fundProvider], offExchangeProviders: [offExchangeProvider] });
    const result = queryIndexComparison(db, "NASDAQ_100");

    expect(result.offExchange).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "021778", shareClass: "F", limitAmountYuan: 10000 }),
      expect.objectContaining({ code: "016533", shareClass: "C", limitAmountYuan: 100 }),
      expect.objectContaining({ code: "000834", shareClass: "A", limitAmountYuan: 10 })
    ]));
  });

  it("adds curated stock scan funds to the fund snapshot for concentration holdings", async () => {
    const db = createInMemoryDatabase();
    const fundProvider: DataProvider<Fund[]> = {
      name: "test-fund-search",
      fetch: async () => ({
        ok: true,
        source: "test-fund-search",
        dataDate: "2026-06-09",
        confidence: 0.9,
        data: [
          { code: "159513", name: "纳斯达克100ETF大成", fundType: "指数型-海外股票", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true }
        ]
      })
    };

    await runDailySync(db, { areas: ["fund"], fundProviders: [fundProvider] });

    const rows = db.prepare(`
      SELECT code, name, tracking_target_code AS trackingTargetCode
      FROM funds
      WHERE code IN ('159513', '539002')
      ORDER BY code
    `).all();

    expect(rows).toEqual([
      { code: "159513", name: "纳斯达克100ETF大成", trackingTargetCode: "NASDAQ_100" },
      { code: "539002", name: "建信新兴市场混合(QDII)A", trackingTargetCode: null }
    ]);
  });

  it("merges discovered active QDII stock scan funds during live fund sync", async () => {
    const db = createInMemoryDatabase();
    const fundProvider: DataProvider<Fund[]> = {
      name: "test-fund-search",
      fetch: async () => ({
        ok: true,
        source: "test-fund-search",
        dataDate: "2026-06-09",
        confidence: 0.9,
        data: [
          { code: "159513", name: "纳斯达克100ETF大成", fundType: "指数型-海外股票", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true }
        ]
      })
    };

    await runDailySync(db, {
      areas: ["fund"],
      useLiveProviders: true,
      fundProviders: [fundProvider],
      trackingProfileSync: async () => [],
      stockScanFundDiscovery: async () => [{
        code: "006308",
        name: "华夏全球科技先锋混合(QDII)",
        fundType: "QDII-混合偏股",
        venue: "off_exchange",
        shareClass: "A",
        enabled: true,
        discoverySource: "stock-scan"
      }]
    });

    const rows = db.prepare(`
      SELECT code, tracking_target_code AS trackingTargetCode
      FROM funds
      WHERE code IN ('159513', '006308', '539002')
      ORDER BY code
    `).all();

    expect(rows).toEqual([
      { code: "006308", trackingTargetCode: null },
      { code: "159513", trackingTargetCode: "NASDAQ_100" },
      { code: "539002", trackingTargetCode: null }
    ]);
  });

  it("persists stock scan universe funds without attaching them to an index target", async () => {
    const db = createInMemoryDatabase();
    const fundProvider: DataProvider<Fund[]> = {
      name: "test-fund-search",
      fetch: async () => ({
        ok: true,
        source: "test-fund-search",
        dataDate: "2026-06-09",
        confidence: 0.9,
        data: [
          { code: "159513", name: "纳斯达克100ETF大成", fundType: "指数型-海外股票", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true },
          { code: "000834", name: "大成纳斯达克100ETF联接(QDII)A", fundType: "指数型-海外股票", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "A", enabled: true }
        ]
      })
    };

    await runDailySync(db, { areas: ["fund"], fundProviders: [fundProvider] });

    const scanFund = db.prepare(`
      SELECT code, name, venue, tracking_target_code AS trackingTargetCode, share_class AS shareClass, enabled
      FROM funds
      WHERE code = '539002'
    `).get();
    const comparison = queryIndexComparison(db, "NASDAQ_100");

    expect(scanFund).toEqual({
      code: "539002",
      name: "建信新兴市场混合(QDII)A",
      venue: "off_exchange",
      trackingTargetCode: null,
      shareClass: "A",
      enabled: 1
    });
    expect([...comparison.onExchange, ...comparison.offExchange].map((row) => row.code)).not.toContain("539002");
  });

  it("builds stock_fund_index after live holdings sync", async () => {
    const db = createInMemoryDatabase();
    const fundProvider: DataProvider<Fund[]> = {
      name: "test-fund-search",
      fetch: async () => ({
        ok: true,
        source: "test-fund-search",
        dataDate: "2026-06-09",
        confidence: 0.9,
        data: [
          { code: "513100", name: "纳指ETF", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true }
        ]
      })
    };
    const holdingProvider: DataProvider<FundHolding[]> = {
      name: "test-holdings",
      fetch: async () => ({
        ok: true,
        source: "eastmoney-f10-jjcc",
        dataDate: "2026Q1",
        confidence: 0.9,
        data: [
          { fundCode: "539002", stockCode: "NVDA", stockName: "英伟达", navPercent: 11.5, reportPeriod: "2026Q1", source: "eastmoney-f10-jjcc", syncRunId: "run-1" },
          { fundCode: "513100", stockCode: "NVDA", stockName: "NVIDIA Corp", navPercent: 9.2, reportPeriod: "2026Q1", source: "eastmoney-f10-jjcc", syncRunId: "run-1" }
        ]
      })
    };

    await runDailySync(db, {
      areas: ["fund", "holding"],
      useLiveProviders: true,
      fundProviders: [fundProvider],
      holdingProviders: [holdingProvider],
      trackingProfileSync: async () => [],
      stockScanFundDiscovery: async () => [],
      qdiiHoldingsCatalogLoader: async () => [{
        code: "539002",
        name: "建信新兴市场混合(QDII)A",
        fundType: "QDII",
        venue: "off_exchange",
        shareClass: "A",
        enabled: false,
        discoverySource: "qdii-holdings-scan"
      }]
    });

    expect(db.prepare("SELECT COUNT(*) AS count FROM stock_fund_index WHERE stock_key = 'NVDA'").get()).toEqual({ count: 2 });
    expect(db.prepare("SELECT enabled FROM funds WHERE code = '539002'").get()).toEqual({ enabled: 1 });
    expect(queryStockConcentration(db, "NVDA").rows.map((row) => row.fundCode)).toEqual(expect.arrayContaining(["539002", "513100"]));
  });

  it("includes stock scan universe holdings in stock concentration rankings", async () => {
    const db = createInMemoryDatabase();
    const holdingProvider: DataProvider<FundHolding[]> = {
      name: "test-holdings",
      fetch: async () => ({
        ok: true,
        source: "test-holdings",
        dataDate: "2026Q1",
        confidence: 0.9,
        data: [
          { fundCode: "539002", stockCode: "NVDA", stockName: "英伟达", navPercent: 11.5, reportPeriod: "2026Q1", source: "test-holdings", syncRunId: "run-1" }
        ]
      })
    };

    await runDailySync(db, { areas: ["holding"], holdingProviders: [holdingProvider] });

    const rows = db.prepare(`
      SELECT h.fund_code AS fundCode, h.stock_code AS stockCode, h.nav_percent AS navPercent
      FROM fund_holdings h
      WHERE h.fund_code = '539002'
    `).all();

    expect(rows).toEqual([{ fundCode: "539002", stockCode: "NVDA", navPercent: 11.5 }]);
  });

  it("uses on-exchange quote provider data when available", async () => {
    const db = createInMemoryDatabase();
    const provider: DataProvider<FundQuote[]> = {
      name: "test-quotes",
      fetch: async () => ({
        ok: true,
        source: "test-quotes",
        dataDate: "2026-06-09",
        confidence: 0.85,
        data: [{ fundCode: "513100", closePrice: 1.3, closingPremiumDiscountRate: 0.02, turnover: 90000000, tradeDate: "2026-06-09", source: "test-quotes", syncRunId: "run-1" }]
      })
    };

    await runDailySync(db, { quoteProviders: [provider] });
    const result = queryIndexComparison(db, "NASDAQ_100");

    expect(result.onExchange.find((row) => row.code === "513100")).toMatchObject({ code: "513100", closePrice: 1.3, closingPremiumDiscountRate: 0.02, source: "test-quotes" });
  });

  it("uses cached quotes for on-exchange funds not refreshed by the provider", async () => {
    const db = createInMemoryDatabase();
    const funds: Fund[] = [
      { code: "159513", name: "纳斯达克100ETF大成", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true },
      { code: "513390", name: "纳指100ETF博时", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true }
    ];
    const fundProvider: DataProvider<Fund[]> = {
      name: "test-funds",
      fetch: async () => ({ ok: true, source: "test-funds", dataDate: "2026-06-10", confidence: 0.9, data: funds })
    };
    const firstQuoteProvider: DataProvider<FundQuote[]> = {
      name: "initial-quotes",
      fetch: async () => ({
        ok: true,
        source: "initial-quotes",
        dataDate: "2026-06-08",
        confidence: 0.8,
        data: [
          { fundCode: "159513", closePrice: 1.7, closingPremiumDiscountRate: null, turnover: 100, tradeDate: "2026-06-08", source: "initial-quotes", syncRunId: "run-1" },
          { fundCode: "513390", closePrice: 2.3, closingPremiumDiscountRate: null, turnover: 200, tradeDate: "2026-06-08", source: "initial-quotes", syncRunId: "run-1" }
        ]
      })
    };
    await runDailySync(db, { fundProviders: [fundProvider], quoteProviders: [firstQuoteProvider] });

    const partialQuoteProvider: DataProvider<FundQuote[]> = {
      name: "partial-quotes",
      fetch: async () => ({
        ok: true,
        source: "partial-quotes",
        dataDate: "2026-06-09",
        confidence: 0.8,
        data: [
          { fundCode: "159513", closePrice: 1.8, closingPremiumDiscountRate: null, turnover: 300, tradeDate: "2026-06-09", source: "partial-quotes", syncRunId: "run-2" }
        ]
      })
    };

    await runDailySync(db, { fundProviders: [fundProvider], quoteProviders: [partialQuoteProvider] });
    const result = queryIndexComparison(db, "NASDAQ_100").onExchange;
    const status = querySyncStatus(db).quote;

    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "159513", closePrice: 1.8, source: "partial-quotes" }),
      expect.objectContaining({ code: "513390", closePrice: 2.3, source: "initial-quotes" })
    ]));
    expect(status).toMatchObject({
      status: "fallback",
      source: "partial-quotes+local-cache",
      dataDate: "2026-06-09",
      itemCount: 2,
      freshItemCount: 1,
      cachedItemCount: 1
    });
  });

  it("backfills stale turnover from local cache when live quote lacks kline turnover", async () => {
    const db = createInMemoryDatabase();
    const funds: Fund[] = [
      { code: "513390", name: "纳指100ETF博时", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true }
    ];
    const fundProvider: DataProvider<Fund[]> = {
      name: "test-funds",
      fetch: async () => ({ ok: true, source: "test-funds", dataDate: "2026-06-10", confidence: 0.9, data: funds })
    };
    const seededQuoteProvider: DataProvider<FundQuote[]> = {
      name: "seeded-quotes",
      fetch: async () => ({
        ok: true,
        source: "eastmoney-on-exchange-quote",
        dataDate: "2026-06-09",
        confidence: 0.9,
        data: [{
          fundCode: "513390",
          closePrice: 2.3,
          closingPremiumDiscountRate: null,
          turnover: 88_000_000,
          tradeDate: "2026-06-09",
          source: "eastmoney-on-exchange-quote",
          syncRunId: "run-1"
        }]
      })
    };
    await runDailySync(db, { fundProviders: [fundProvider], quoteProviders: [seededQuoteProvider] });

    const spotQuoteProvider: DataProvider<FundQuote[]> = {
      name: "spot-quotes",
      fetch: async () => ({
        ok: true,
        source: "eastmoney-on-exchange-spot",
        dataDate: "2026-06-10",
        confidence: 0.8,
        data: [{
          fundCode: "513390",
          closePrice: 2.42,
          closingPremiumDiscountRate: null,
          turnover: undefined,
          tradeDate: "2026-06-10",
          source: "eastmoney-on-exchange-spot",
          syncRunId: "run-2"
        }]
      })
    };
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchImpl);
    try {
      await runDailySync(db, { fundProviders: [fundProvider], quoteProviders: [spotQuoteProvider] });
    } finally {
      vi.unstubAllGlobals();
    }

    const result = queryIndexComparison(db, "NASDAQ_100").onExchange.find((row) => row.code === "513390");
    const status = querySyncStatus(db).quote;

    expect(result).toMatchObject({
      code: "513390",
      closePrice: 2.42,
      turnover: 88_000_000,
      source: "eastmoney-on-exchange-quote+stale-turnover"
    });
    expect(status).toMatchObject({
      status: "ok",
      source: "eastmoney-on-exchange-quote+stale-turnover"
    });
  });

  it("falls back to cached fund universe when fund discovery fails", async () => {
    const db = createInMemoryDatabase();
    const cachedFunds: Fund[] = [
      { code: "159632", name: "纳斯达克ETF华安", fundType: "指数型-海外股票", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true },
      { code: "000834", name: "大成纳斯达克100ETF联接(QDII)A", fundType: "指数型-海外股票", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "A", enabled: true }
    ];
    const initialFundProvider: DataProvider<Fund[]> = {
      name: "initial-funds",
      fetch: async () => ({ ok: true, source: "initial-funds", dataDate: "2026-06-09", confidence: 0.9, data: cachedFunds })
    };
    await runDailySync(db, { areas: ["fund"], fundProviders: [initialFundProvider] });

    const blockedFundProvider: DataProvider<Fund[]> = {
      name: "blocked-funds",
      fetch: async () => ({ ok: false, errorCategory: "network", message: "fetch failed" })
    };
    await runDailySync(db, { areas: ["fund"], fundProviders: [blockedFundProvider] });

    const comparison = queryIndexComparison(db, "NASDAQ_100");
    const status = querySyncStatus(db).fund;

    expect([...comparison.onExchange, ...comparison.offExchange].map((row) => row.code)).toEqual(expect.arrayContaining(["159632", "000834"]));
    expect(status).toMatchObject({
      status: "fallback",
      source: "local-cache",
      errorCategory: "network",
      message: "fetch failed"
    });
  });

  it("falls back to the latest cached quotes when quote providers fail", async () => {
    const db = createInMemoryDatabase();
    await runDailySync(db);
    const provider: DataProvider<FundQuote[]> = {
      name: "blocked-quotes",
      fetch: async () => ({ ok: false, errorCategory: "network", message: "socket closed" })
    };

    await runDailySync(db, { quoteProviders: [provider] });
    const result = queryIndexComparison(db, "NASDAQ_100");
    const status = querySyncStatus(db).quote;

    expect(result.onExchange.find((row) => row.code === "513100")).toMatchObject({ code: "513100", closePrice: 1.23, source: "eastmoney" });
    expect(status).toMatchObject({
      status: "fallback",
      source: "local-cache",
      dataDate: "2026-06-08",
      itemCount: 1,
      errorCategory: "network",
      message: "socket closed"
    });
  });

  it("records sync runs and provider attempts for audit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-11T03:04:05.000Z"));
    const db = createInMemoryDatabase();
    const blockedProvider: DataProvider<FundQuote[]> = {
      name: "blocked-quotes",
      fetch: async () => ({ ok: false, errorCategory: "anti_scraping", message: "blocked by provider", rawPayloadHash: "hash-1" })
    };
    const backupProvider: DataProvider<FundQuote[]> = {
      name: "backup-quotes",
      fetch: async () => ({
        ok: true,
        source: "backup-quotes",
        dataDate: "2026-06-10",
        confidence: 0.75,
        rawPayloadHash: "hash-2",
        data: [{ fundCode: "513100", closePrice: 1.3, closingPremiumDiscountRate: 0.01, turnover: 100, tradeDate: "2026-06-10", source: "backup-quotes", syncRunId: "run-1" }]
      })
    };

    try {
      await runDailySync(db, { quoteProviders: [blockedProvider, backupProvider] });
    } finally {
      vi.useRealTimers();
    }

    const runs = db.prepare(`
      SELECT sync_run_id AS syncRunId, status, started_at AS startedAt, completed_at AS completedAt
      FROM sync_runs
    `).all();
    const attempts = db.prepare(`
      SELECT sync_run_id AS syncRunId, area, provider_name AS providerName, ok, confidence, fetched_at AS fetchedAt, error_category AS errorCategory, message, raw_payload_hash AS rawPayloadHash
      FROM provider_results
      ORDER BY area, provider_name
    `).all();

    expect(runs).toEqual([
      {
        syncRunId: "daily-20260611T030405Z",
        status: "completed",
        startedAt: "2026-06-11T03:04:05.000Z",
        completedAt: "2026-06-11T03:04:05.000Z"
      }
    ]);
    expect(attempts).toContainEqual({
      syncRunId: "daily-20260611T030405Z",
      area: "quote",
      providerName: "blocked-quotes",
      ok: 0,
      confidence: null,
      fetchedAt: "2026-06-11T03:04:05.000Z",
      errorCategory: "anti_scraping",
      message: "blocked by provider",
      rawPayloadHash: "hash-1"
    });
    expect(attempts).toContainEqual({
      syncRunId: "daily-20260611T030405Z",
      area: "quote",
      providerName: "backup-quotes",
      ok: 1,
      confidence: 0.75,
      fetchedAt: "2026-06-11T03:04:05.000Z",
      errorCategory: null,
      message: null,
      rawPayloadHash: "hash-2"
    });
  });

  it("falls back to mock off-exchange snapshots when live providers fail", async () => {
    const db = createInMemoryDatabase();
    const provider: DataProvider<OffExchangeFeeLimitSnapshot> = {
      name: "blocked-f10",
      fetch: async () => ({ ok: false, errorCategory: "anti_scraping", message: "blocked" })
    };

    await runDailySync(db, { offExchangeProviders: [provider] });
    const result = queryIndexComparison(db, "NASDAQ_100");

    expect(result.offExchange.find((row) => row.code === "000834")?.source).toBe("tiantian");
    expect(result.offExchange.find((row) => row.code === "000834")?.limitAmountYuan).toBe(1000);
    expect(querySyncStatus(db).purchaseLimit).toMatchObject({
      status: "fallback",
      source: "tiantian",
      errorCategory: "anti_scraping",
      itemCount: 3
    });
    expect(querySyncStatus(db).fee).toMatchObject({
      status: "fallback",
      source: "tiantian",
      errorCategory: "anti_scraping",
      itemCount: 0
    });
  });

  it("falls back to cached off-exchange snapshots when off-exchange providers fail", async () => {
    const db = createInMemoryDatabase();
    const funds: Fund[] = [
      { code: "000834", name: "大成纳斯达克100ETF联接(QDII)A", fundType: "指数型-海外股票", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "A", enabled: true }
    ];
    const fundProvider: DataProvider<Fund[]> = {
      name: "test-fund-search",
      fetch: async () => ({ ok: true, source: "test-fund-search", dataDate: "2026-06-09", confidence: 0.9, data: funds })
    };
    const initialOffExchangeProvider: DataProvider<OffExchangeFeeLimitSnapshot> = {
      name: "initial-f10",
      fetch: async () => ({
        ok: true,
        source: "initial-f10",
        dataDate: "2026-06-09",
        confidence: 0.9,
        data: {
          limits: [{ fundCode: "000834", shareClass: "A", status: "limited", limitAmountYuan: 1000, limitUnit: "per_day", channelScope: "agency", source: "initial-f10", dataDate: "2026-06-09", confidence: 0.9, syncRunId: "run-1" }],
          fees: [{ fundCode: "000834", feeType: "subscription", rate: 0.0012, amountTierLowerBound: 0, channelScope: "agency", source: "initial-f10", dataDate: "2026-06-09", syncRunId: "run-1" }]
        }
      })
    };
    await runDailySync(db, { fundProviders: [fundProvider], offExchangeProviders: [initialOffExchangeProvider] });

    const blockedOffExchangeProvider: DataProvider<OffExchangeFeeLimitSnapshot> = {
      name: "blocked-f10",
      fetch: async () => ({ ok: false, errorCategory: "anti_scraping", message: "blocked" })
    };
    await runDailySync(db, { fundProviders: [fundProvider], offExchangeProviders: [blockedOffExchangeProvider] });

    const result = queryIndexComparison(db, "NASDAQ_100");
    const status = querySyncStatus(db);

    expect(result.offExchange[0]).toMatchObject({ code: "000834", limitAmountYuan: 1000, defaultSubscriptionRate: 0.0012, source: "initial-f10" });
    expect(status.purchaseLimit).toMatchObject({
      status: "fallback",
      source: "local-cache",
      dataDate: "2026-06-09",
      itemCount: 1,
      errorCategory: "anti_scraping",
      message: "blocked"
    });
    expect(status.fee).toMatchObject({
      status: "fallback",
      source: "local-cache",
      dataDate: "2026-06-09",
      itemCount: 1,
      errorCategory: "anti_scraping",
      message: "blocked"
    });
  });

  it("does not attach stale mock limits to a discovered live fund universe", async () => {
    const db = createInMemoryDatabase();
    const funds: Fund[] = [
      { code: "000834", name: "大成纳斯达克100ETF联接(QDII)A", fundType: "指数型-海外股票", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "A", enabled: true }
    ];
    const fundProvider: DataProvider<Fund[]> = {
      name: "test-fund-search",
      fetch: async () => ({ ok: true, source: "test-fund-search", dataDate: "2026-06-09", confidence: 0.9, data: funds })
    };
    const offExchangeProvider: DataProvider<OffExchangeFeeLimitSnapshot> = {
      name: "blocked-f10",
      fetch: async () => ({ ok: false, errorCategory: "anti_scraping", message: "blocked" })
    };

    await runDailySync(db, { fundProviders: [fundProvider], offExchangeProviders: [offExchangeProvider] });
    const result = queryIndexComparison(db, "NASDAQ_100");

    expect(result.offExchange).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "000834", source: undefined, limitAmountYuan: undefined })
    ]));
    // No stale mock limits should leak onto the discovered universe.
    for (const row of result.offExchange) {
      expect(row.source).toBeUndefined();
      expect(row.limitAmountYuan).toBeUndefined();
    }
  });

  it("marks the sync run failed when a requested area has no usable snapshot", async () => {
    const db = createInMemoryDatabase();
    const funds: Fund[] = [
      { code: "000834", name: "大成纳斯达克100ETF联接(QDII)A", fundType: "指数型-海外股票", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "A", enabled: true }
    ];
    const fundProvider: DataProvider<Fund[]> = {
      name: "test-fund-search",
      fetch: async () => ({ ok: true, source: "test-fund-search", dataDate: "2026-06-09", confidence: 0.9, data: funds })
    };
    const offExchangeProvider: DataProvider<OffExchangeFeeLimitSnapshot> = {
      name: "blocked-f10",
      fetch: async () => ({ ok: false, errorCategory: "anti_scraping", message: "blocked" })
    };

    await runDailySync(db, { areas: ["offExchange"], fundProviders: [fundProvider], offExchangeProviders: [offExchangeProvider] });

    const run = db.prepare("SELECT status FROM sync_runs").get() as { status: string };
    expect(run.status).toBe("failed");
  });
});
