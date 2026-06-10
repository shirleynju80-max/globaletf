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
      fees: [{ fundCode: "000834", feeType: "subscription", rate: 0.0012, amountTierLowerBound: 0, amountTierUpperBound: 500000, channelScope: "agency", source: "tiantian", dataDate: "2026-06-09", syncRunId: "run-1" }],
      holdings: []
    });

    const result = queryIndexComparison(db, "NASDAQ_100");
    const feeCount = db.prepare("SELECT COUNT(*) AS count FROM fund_fees").get() as { count: number };

    expect(result.onExchange).toHaveLength(1);
    expect(result.offExchange).toHaveLength(1);
    expect(result.offExchange[0].limitAmountYuan).toBe(1000);
    expect(feeCount.count).toBe(1);
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

  it("prefers the latest F10 purchase limit snapshot over older fallback data", () => {
    const db = createInMemoryDatabase();
    insertSnapshotBundle(db, {
      syncRunId: "run-1",
      funds: [
        { code: "000834", name: "纳指100联接A", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "A", parentFundCode: "000834", enabled: true }
      ],
      quotes: [],
      limits: [
        { fundCode: "000834", shareClass: "A", status: "limited", limitAmountYuan: 1000, limitUnit: "per_day", channelScope: "agency", source: "tiantian", dataDate: "2026-06-09", confidence: 0.7, syncRunId: "run-1" },
        { fundCode: "000834", shareClass: "A", status: "limited", limitAmountYuan: 10, limitUnit: "per_day", channelScope: "agency", source: "tiantian-f10-jjfl", dataDate: "2026-06-09", confidence: 0.9, syncRunId: "run-1" }
      ],
      fees: [],
      holdings: []
    });

    const result = queryIndexComparison(db, "NASDAQ_100");

    expect(result.offExchange).toHaveLength(1);
    expect(result.offExchange[0]).toMatchObject({ limitAmountYuan: 10, source: "tiantian-f10-jjfl" });
  });

  it("replaces fee tiers for the same fund source and data date", () => {
    const db = createInMemoryDatabase();
    const bundle = {
      syncRunId: "run-1",
      funds: [
        { code: "000834", name: "纳指100联接A", fundType: "QDII", venue: "off_exchange" as const, trackingTargetCode: "NASDAQ_100", shareClass: "A" as const, parentFundCode: "000834", enabled: true }
      ],
      quotes: [],
      limits: [],
      fees: [{ fundCode: "000834", feeType: "subscription" as const, rate: 0.0012, amountTierLowerBound: 0, amountTierUpperBound: 500000, channelScope: "agency" as const, source: "tiantian-f10-jjfl", dataDate: "2026-06-09", syncRunId: "run-1" }],
      holdings: []
    };

    insertSnapshotBundle(db, bundle);
    insertSnapshotBundle(db, {
      ...bundle,
      fees: [{ ...bundle.fees[0], rate: 0.001 }]
    });

    const rows = db.prepare("SELECT rate FROM fund_fees WHERE fund_code = '000834'").all() as Array<{ rate: number }>;
    expect(rows).toEqual([{ rate: 0.001 }]);
  });

  it("disables stale funds for targets included in a new snapshot", () => {
    const db = createInMemoryDatabase();
    insertSnapshotBundle(db, {
      syncRunId: "run-1",
      funds: [
        { code: "020123", name: "旧纳指F", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "F", enabled: true }
      ],
      quotes: [],
      limits: [{ fundCode: "020123", shareClass: "F", status: "limited", limitAmountYuan: 10000, limitUnit: "per_day", channelScope: "direct", source: "tiantian", dataDate: "2026-06-09", confidence: 0.8, syncRunId: "run-1" }],
      fees: [],
      holdings: []
    });
    insertSnapshotBundle(db, {
      syncRunId: "run-2",
      funds: [
        { code: "021778", name: "广发纳指100ETF联接(QDII)人民币F", fundType: "指数型-海外股票", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "F", enabled: true }
      ],
      quotes: [],
      limits: [{ fundCode: "021778", shareClass: "F", status: "limited", limitAmountYuan: 10000, limitUnit: "per_day", channelScope: "direct", source: "tiantian-f10-jjfl", dataDate: "2026-06-09", confidence: 0.9, syncRunId: "run-2" }],
      fees: [],
      holdings: []
    });

    const result = queryIndexComparison(db, "NASDAQ_100");

    expect(result.offExchange.map((row) => row.code)).toEqual(["021778"]);
  });
});
