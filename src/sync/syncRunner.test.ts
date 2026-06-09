import { describe, expect, it } from "vitest";
import { createInMemoryDatabase } from "../db/database";
import { queryIndexComparison } from "../db/repositories";
import type { DataProvider } from "../providers/types";
import type { OffExchangeFeeLimitSnapshot } from "../providers/eastmoneyF10";
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
});
