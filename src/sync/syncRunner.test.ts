import { describe, expect, it } from "vitest";
import { createInMemoryDatabase } from "../db/database";
import { queryIndexComparison } from "../db/repositories";
import type { DataProvider } from "../providers/types";
import type { OffExchangeFeeLimitSnapshot } from "../providers/eastmoneyF10";
import type { Fund } from "../domain/types";
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
