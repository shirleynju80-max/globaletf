import { describe, expect, it } from "vitest";
import { createInMemoryDatabase } from "./database";
import { insertSnapshotBundle, queryIndexComparison } from "./repositories";

describe("repositories", () => {
  it("returns grouped index comparison rows from latest snapshots", () => {
    const db = createInMemoryDatabase();
    insertSnapshotBundle(db, {
      syncRunId: "run-1",
      funds: [
        { code: "513100", name: "纳指ETF", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true },
        { code: "000834", name: "纳指100联接A", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "A", parentFundCode: "000834", enabled: true }
      ],
      quotes: [{ fundCode: "513100", closePrice: 1.23, closingPremiumDiscountRate: 0.012, turnover: 120000000, tradeDate: "2026-06-08", source: "eastmoney", syncRunId: "run-1" }],
      limits: [{ fundCode: "000834", shareClass: "A", status: "limited", limitAmountYuan: 1000, limitUnit: "per_day", channelScope: "agency", source: "tiantian", dataDate: "2026-06-09", confidence: 0.9, syncRunId: "run-1" }],
      fees: [],
      holdings: []
    });

    const result = queryIndexComparison(db, "NASDAQ_100");

    expect(result.onExchange).toHaveLength(1);
    expect(result.offExchange).toHaveLength(1);
    expect(result.offExchange[0].limitAmountYuan).toBe(1000);
  });

  it("keeps closing premium empty when same-date NAV is unavailable", () => {
    const db = createInMemoryDatabase();
    insertSnapshotBundle(db, {
      syncRunId: "run-1",
      funds: [
        { code: "513100", name: "纳指ETF", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true }
      ],
      quotes: [{ fundCode: "513100", closePrice: 1.23, closingPremiumDiscountRate: null, turnover: 120000000, tradeDate: "2026-06-08", source: "eastmoney", syncRunId: "run-1" }],
      limits: [],
      fees: [],
      holdings: []
    });

    const result = queryIndexComparison(db, "NASDAQ_100");

    expect(result.onExchange[0].closingPremiumDiscountRate).toBeNull();
  });
});
