import { describe, expect, it } from "vitest";
import { createInMemoryDatabase } from "../db/database";
import { queryIndexComparison, querySyncStatus } from "../db/repositories";
import type { DataProvider } from "../providers/types";
import type { OffExchangeFeeLimitSnapshot } from "../providers/eastmoneyF10";
import type { Fund, FundHolding, FundQuote } from "../domain/types";
import { runDailySync } from "./syncRunner";

describe("sync runner", () => {
  it("writes mock snapshots and keeps them queryable", async () => {
    const db = createInMemoryDatabase();
    await runDailySync(db);
    const result = queryIndexComparison(db, "NASDAQ_100");
    expect(result.onExchange.length).toBeGreaterThan(0);
    expect(result.offExchange.length).toBeGreaterThan(0);
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

    expect(result.offExchange.map((row) => [row.code, row.shareClass, row.limitAmountYuan])).toEqual([
      ["000834", "A", 10],
      ["016533", "C", 100],
      ["021778", "F", 10000]
    ]);
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

    expect(result.onExchange[0]).toMatchObject({ code: "513100", closePrice: 1.3, closingPremiumDiscountRate: 0.02, source: "test-quotes" });
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

    expect(result.map((row) => [row.code, row.closePrice, row.source])).toEqual([
      ["159513", 1.8, "partial-quotes"],
      ["513390", 2.3, "initial-quotes"]
    ]);
    expect(status).toMatchObject({
      status: "fallback",
      source: "partial-quotes+local-cache",
      dataDate: "2026-06-09",
      itemCount: 2,
      freshItemCount: 1,
      cachedItemCount: 1
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

    expect(result.onExchange[0]).toMatchObject({ code: "513100", closePrice: 1.23, source: "eastmoney" });
    expect(status).toMatchObject({
      status: "fallback",
      source: "local-cache",
      dataDate: "2026-06-08",
      itemCount: 1,
      errorCategory: "network",
      message: "socket closed"
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

    expect(result.offExchange).toEqual([
      expect.objectContaining({ code: "000834", source: null, limitAmountYuan: null })
    ]);
  });
});
