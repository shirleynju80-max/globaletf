import { describe, expect, it } from "vitest";
import { createInMemoryDatabase } from "./database";
import { insertSnapshotBundle, queryIndexComparison, queryStockConcentration, querySyncStatus, recordSyncStatus, rebuildStockFundIndex } from "./repositories";

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
      fees: [
        { fundCode: "000834", feeType: "subscription", rate: 0.0012, amountTierLowerBound: 0, amountTierUpperBound: 500000, channelScope: "agency", source: "tiantian", dataDate: "2026-06-09", syncRunId: "run-1" },
        { fundCode: "000834", feeType: "subscription", rate: 0.001, amountTierLowerBound: 500000, amountTierUpperBound: 2000000, channelScope: "agency", source: "tiantian", dataDate: "2026-06-09", syncRunId: "run-1" },
        { fundCode: "000834", feeType: "redemption", rate: 0.015, minHoldingDays: 0, maxHoldingDays: 6, channelScope: "agency", source: "tiantian", dataDate: "2026-06-09", syncRunId: "run-1" },
        { fundCode: "000834", feeType: "redemption", rate: 0.005, minHoldingDays: 7, maxHoldingDays: 29, channelScope: "agency", source: "tiantian", dataDate: "2026-06-09", syncRunId: "run-1" },
        { fundCode: "000834", feeType: "management", rate: 0.008, channelScope: "agency", source: "tiantian", dataDate: "2026-06-09", syncRunId: "run-1" },
        { fundCode: "000834", feeType: "custodian", rate: 0.002, channelScope: "agency", source: "tiantian", dataDate: "2026-06-09", syncRunId: "run-1" },
        { fundCode: "000834", feeType: "sales_service", rate: 0, channelScope: "agency", source: "tiantian", dataDate: "2026-06-09", syncRunId: "run-1" }
      ],
      holdings: []
    });

    const result = queryIndexComparison(db, "NASDAQ_100");
    const feeCount = db.prepare("SELECT COUNT(*) AS count FROM fund_fees").get() as { count: number };

    expect(result.onExchange).toHaveLength(1);
    expect(result.offExchange).toHaveLength(1);
    expect(result.offExchange[0].limitAmountYuan).toBe(1000);
    expect(result.offExchange[0]).toMatchObject({ limitDataDate: "2026-06-09", limitUnit: "per_day" });
    expect(feeCount.count).toBe(7);
    expect(result.offExchange[0]).toMatchObject({
      defaultSubscriptionRate: 0.0012,
      managementRate: 0.008,
      custodianRate: 0.002,
      salesServiceRate: 0,
      redemptionFeeSummary: "0-6天: 1.5%; 7-29天: 0.5%"
    });
  });

  it("orders index comparison rows by liquidity and purchase capacity", () => {
    const db = createInMemoryDatabase();
    insertSnapshotBundle(db, {
      syncRunId: "run-1",
      funds: [
        { code: "513100", name: "低成交ETF", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true },
        { code: "159513", name: "高成交ETF", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true },
        { code: "000834", name: "限额低A", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "A", enabled: true },
        { code: "021778", name: "限额高F", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "F", enabled: true },
        { code: "050025", name: "开放A", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "A", enabled: true },
        { code: "016532", name: "未知C", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "C", enabled: true }
      ],
      quotes: [
        { fundCode: "513100", closePrice: 1, closingPremiumDiscountRate: 0, iopvPremiumDiscountRate: 0.03, turnover: 100, tradeDate: "2026-06-10", source: "eastmoney", syncRunId: "run-1" },
        { fundCode: "159513", closePrice: 1, closingPremiumDiscountRate: 0, iopvPremiumDiscountRate: 0.08, turnover: 1000, tradeDate: "2026-06-10", source: "eastmoney", syncRunId: "run-1" }
      ],
      limits: [
        { fundCode: "000834", shareClass: "A", status: "limited", limitAmountYuan: 1000, limitUnit: "per_day", channelScope: "agency", source: "tiantian", dataDate: "2026-06-10", confidence: 0.9, syncRunId: "run-1" },
        { fundCode: "021778", shareClass: "F", status: "limited", limitAmountYuan: 10000, limitUnit: "per_day", channelScope: "direct", source: "tiantian", dataDate: "2026-06-10", confidence: 0.9, syncRunId: "run-1" },
        { fundCode: "050025", shareClass: "A", status: "open", channelScope: "agency", source: "tiantian", dataDate: "2026-06-10", confidence: 0.9, syncRunId: "run-1" }
      ],
      fees: [],
      holdings: []
    });

    const result = queryIndexComparison(db, "NASDAQ_100");

    expect(result.onExchange.map((row) => row.code)).toEqual(["159513", "513100"]);
    expect(result.offExchange.map((row) => row.code)).toEqual(["050025", "021778", "000834", "016532"]);
  });

  it("uses lower visible fee cost as an off-exchange tie-breaker", () => {
    const db = createInMemoryDatabase();
    insertSnapshotBundle(db, {
      syncRunId: "run-1",
      funds: [
        { code: "000001", name: "高费率A", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "A", enabled: true },
        { code: "000002", name: "低费率A", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "A", enabled: true }
      ],
      quotes: [],
      limits: [
        { fundCode: "000001", shareClass: "A", status: "limited", limitAmountYuan: 1000, limitUnit: "per_day", channelScope: "agency", source: "tiantian", dataDate: "2026-06-10", confidence: 0.9, syncRunId: "run-1" },
        { fundCode: "000002", shareClass: "A", status: "limited", limitAmountYuan: 1000, limitUnit: "per_day", channelScope: "agency", source: "tiantian", dataDate: "2026-06-10", confidence: 0.9, syncRunId: "run-1" }
      ],
      fees: [
        { fundCode: "000001", feeType: "subscription", rate: 0.0015, amountTierLowerBound: 0, channelScope: "agency", source: "tiantian", dataDate: "2026-06-10", syncRunId: "run-1" },
        { fundCode: "000001", feeType: "management", rate: 0.01, channelScope: "agency", source: "tiantian", dataDate: "2026-06-10", syncRunId: "run-1" },
        { fundCode: "000002", feeType: "subscription", rate: 0.0005, amountTierLowerBound: 0, channelScope: "agency", source: "tiantian", dataDate: "2026-06-10", syncRunId: "run-1" },
        { fundCode: "000002", feeType: "management", rate: 0.005, channelScope: "agency", source: "tiantian", dataDate: "2026-06-10", syncRunId: "run-1" }
      ],
      holdings: []
    });

    const result = queryIndexComparison(db, "NASDAQ_100");

    expect(result.offExchange.map((row) => row.code)).toEqual(["000002", "000001"]);
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

  it("returns NAV reference metadata for on-exchange premium context", () => {
    const db = createInMemoryDatabase();
    insertSnapshotBundle(db, {
      syncRunId: "run-1",
      funds: [
        { code: "159659", name: "纳斯达克100ETF招商", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true }
      ],
      quotes: [{
        fundCode: "159659",
        closePrice: 2.236,
        closingPremiumDiscountRate: 0.0366,
        unitNav: 2.157,
        navDate: "2026-06-11",
        turnover: 417221586.4,
        tradeDate: "2026-06-13",
        source: "eastmoney-on-exchange-spot",
        syncRunId: "run-1"
      }],
      limits: [],
      fees: [],
      holdings: []
    });

    const result = queryIndexComparison(db, "NASDAQ_100");

    expect(result.onExchange[0]).toMatchObject({
      code: "159659",
      closingPremiumDiscountRate: 0.0366,
      unitNav: 2.157,
      navDate: "2026-06-11"
    });
  });

  it("prefers live on-exchange quotes over older mock quotes", () => {
    const db = createInMemoryDatabase();
    insertSnapshotBundle(db, {
      syncRunId: "run-1",
      funds: [
        { code: "513100", name: "纳指ETF", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true }
      ],
      quotes: [
        { fundCode: "513100", closePrice: 1.23, closingPremiumDiscountRate: 0.012, turnover: 120000000, tradeDate: "2026-06-08", source: "eastmoney", syncRunId: "run-1" },
        { fundCode: "513100", closePrice: 1.3, closingPremiumDiscountRate: null, turnover: 90000000, tradeDate: "2026-06-09", source: "eastmoney-on-exchange-quote", syncRunId: "run-2" }
      ],
      limits: [],
      fees: [],
      holdings: []
    });

    const result = queryIndexComparison(db, "NASDAQ_100");

    expect(result.onExchange[0]).toMatchObject({ closePrice: 1.3, source: "eastmoney-on-exchange-quote" });
  });

  it("fills missing IOPV from a same-day spot snapshot while keeping kline turnover", () => {
    const db = createInMemoryDatabase();
    insertSnapshotBundle(db, {
      syncRunId: "run-1",
      funds: [
        { code: "159632", name: "纳斯达克ETF华安", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true }
      ],
      quotes: [
        {
          fundCode: "159632",
          closePrice: 2.478,
          closingPremiumDiscountRate: 0.0837,
          turnover: 645942036.486,
          tradeDate: "2026-06-15",
          source: "eastmoney-on-exchange-quote",
          syncRunId: "run-1"
        },
        {
          fundCode: "159632",
          closePrice: 2.478,
          closingPremiumDiscountRate: 0.0837,
          iopv: 2.3532,
          iopvTime: "2026-06-16 04:00",
          iopvPremiumDiscountRate: 0.053,
          turnover: 502000944.189,
          tradeDate: "2026-06-15",
          source: "eastmoney-on-exchange-spot",
          syncRunId: "run-1"
        }
      ],
      limits: [],
      fees: [],
      holdings: []
    });

    const result = queryIndexComparison(db, "NASDAQ_100");

    expect(result.onExchange[0]).toMatchObject({
      code: "159632",
      closePrice: 2.478,
      turnover: 645942036.486,
      source: "eastmoney-on-exchange-quote",
      iopvPremiumDiscountRate: 0.053,
      iopv: 2.3532,
      iopvTime: "2026-06-16 04:00"
    });
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

  it("excludes delisted on-exchange funds from index comparison", () => {
    const db = createInMemoryDatabase();
    insertSnapshotBundle(db, {
      syncRunId: "run-1",
      funds: [
        { code: "160213", name: "国泰纳斯达克100指数", fundType: "QDII", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "LOF", enabled: true },
        { code: "513100", name: "纳指ETF", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true }
      ],
      quotes: [
        { fundCode: "513100", closePrice: 2.2, closingPremiumDiscountRate: 0.01, turnover: 100000, tradeDate: "2026-06-15", source: "eastmoney", syncRunId: "run-1" }
      ],
      limits: [],
      fees: [],
      holdings: []
    });

    const result = queryIndexComparison(db, "NASDAQ_100");

    expect(result.onExchange.map((row) => row.code)).toEqual(["513100"]);
  });

  it("prefers direct-channel limits for I shares over newer agency rows without amounts", () => {
    const db = createInMemoryDatabase();
    insertSnapshotBundle(db, {
      syncRunId: "run-1",
      funds: [
        { code: "021000", name: "南方纳斯达克100指数发起(QDII)I", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "I", enabled: true }
      ],
      quotes: [],
      limits: [
        { fundCode: "021000", shareClass: "I", status: "limited", limitAmountYuan: 5000, limitUnit: "per_day", channelScope: "direct", channelId: "nfjj", source: "fundco-announcement-nfjj", dataDate: "2026-04-08", confidence: 0.95, syncRunId: "run-1" },
        { fundCode: "021000", shareClass: "I", status: "limited", limitUnit: "per_day", channelScope: "agency", channelId: "eastmoney_aggregate", source: "tiantian-f10-jjfl", dataDate: "2026-06-16", confidence: 0.9, syncRunId: "run-1" }
      ],
      fees: [],
      holdings: []
    });

    const result = queryIndexComparison(db, "NASDAQ_100");

    expect(result.offExchange).toHaveLength(1);
    expect(result.offExchange[0]).toMatchObject({
      code: "021000",
      limitAmountYuan: 5000,
      channelScope: "direct",
      channelId: "nfjj",
      limitEffectiveDate: "2026-04-08",
      limitSyncedAt: "2026-06-16",
      limitStale: false
    });
  });

  it("reconciles suspended agency status over direct limit amount for I shares", () => {
    const db = createInMemoryDatabase();
    insertSnapshotBundle(db, {
      syncRunId: "run-1",
      funds: [
        { code: "021000", name: "南方纳斯达克100指数发起(QDII)I", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "I", enabled: true }
      ],
      quotes: [],
      limits: [
        { fundCode: "021000", shareClass: "I", status: "limited", limitAmountYuan: 5000, limitUnit: "per_day", channelScope: "direct", channelId: "nfjj", source: "fundco-announcement-nfjj", dataDate: "2026-04-08", confidence: 0.95, syncRunId: "daily-20260616T043844Z" },
        { fundCode: "021000", shareClass: "I", status: "suspended", limitUnit: "per_day", channelScope: "agency", channelId: "eastmoney_aggregate", source: "tiantian-f10-jjfl", dataDate: "2026-06-16", confidence: 0.9, syncRunId: "daily-20260616T043844Z" }
      ],
      fees: [],
      holdings: []
    });

    const result = queryIndexComparison(db, "NASDAQ_100");

    expect(result.offExchange[0]).toMatchObject({
      code: "021000",
      status: "suspended",
      limitAmountYuan: undefined,
      limitEffectiveDate: "2026-06-16",
      limitSyncedAt: "2026-06-16",
      limitStatusConflict: true
    });
  });

  it("falls back from useless direct unknown rows to known direct or agency limits for I shares", () => {
    const db = createInMemoryDatabase();
    insertSnapshotBundle(db, {
      syncRunId: "run-1",
      funds: [
        { code: "024237", name: "博时纳斯达克100ETF发起式联接(QDII)I人民币", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "I", fundCompany: "博时基金", enabled: true }
      ],
      quotes: [],
      limits: [
        { fundCode: "024237", shareClass: "I", status: "unknown", limitUnit: "unknown", channelScope: "direct", channelId: "bosera", source: "fundco-direct-bosera", dataDate: "2026-06-16", confidence: 0.92, syncRunId: "run-1" },
        { fundCode: "024237", shareClass: "I", status: "suspended", limitUnit: "unknown", channelScope: "direct", channelId: "bosera", source: "fundco-announcement-bosera", dataDate: "2026-04-24", confidence: 0.85, syncRunId: "run-1" },
        { fundCode: "024237", shareClass: "I", status: "suspended", limitUnit: "unknown", channelScope: "agency", channelId: "eastmoney_aggregate", source: "tiantian-f10-jjfl", dataDate: "2026-06-16", confidence: 0.9, syncRunId: "run-1" }
      ],
      fees: [],
      holdings: []
    });

    const result = queryIndexComparison(db, "NASDAQ_100");

    expect(result.offExchange).toHaveLength(1);
    expect(result.offExchange[0]).toMatchObject({
      code: "024237",
      status: "suspended",
      channelScope: "agency",
      channelId: "eastmoney_aggregate",
      limitEffectiveDate: "2026-06-16"
    });
  });

  it("returns latest stock concentration rows ranked by holding weight", () => {
    const db = createInMemoryDatabase();
    insertSnapshotBundle(db, {
      syncRunId: "run-1",
      funds: [
        { code: "513100", name: "纳指ETF", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true },
        { code: "000834", name: "纳指100联接A", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "A", parentFundCode: "000834", enabled: true },
        { code: "016532", name: "纳指100联接C", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "C", parentFundCode: "000834", enabled: false }
      ],
      quotes: [],
      limits: [
        { fundCode: "000834", shareClass: "A", status: "limited", limitAmountYuan: 1000, limitUnit: "per_day", channelScope: "agency", source: "tiantian", dataDate: "2026-06-09", confidence: 0.7, syncRunId: "run-1" },
        { fundCode: "000834", shareClass: "A", status: "limited", limitAmountYuan: 5000, limitUnit: "per_day", channelScope: "agency", source: "tiantian-f10-jjfl", dataDate: "2026-06-10", confidence: 0.9, syncRunId: "run-2" }
      ],
      fees: [],
      holdings: [
        { fundCode: "513100", stockCode: "NVDA", stockName: "NVIDIA Corp", navPercent: 8.5, reportPeriod: "2025Q4", source: "eastmoney", syncRunId: "run-1" },
        { fundCode: "513100", stockCode: "NVDA", stockName: "NVIDIA Corp", navPercent: 9.2, reportPeriod: "2026Q1", source: "eastmoney", syncRunId: "run-1" },
        { fundCode: "000834", stockCode: "", stockName: "英伟达", navPercent: 10.1, reportPeriod: "2026Q1", source: "eastmoney", syncRunId: "run-1" },
        { fundCode: "016532", stockCode: "NVDA", stockName: "NVIDIA Corp", navPercent: 11.5, reportPeriod: "2026Q1", source: "eastmoney", syncRunId: "run-1" }
      ]
    });

    const result = queryStockConcentration(db, "NVDA");

    expect(result.rows).toEqual([
      expect.objectContaining({ fundCode: "000834", fundName: "纳指100联接A", shareClass: "A", navPercent: 10.1, reportPeriod: "2026Q1", purchaseStatus: "limited", limitAmountYuan: 5000, limitUnit: "per_day", limitDataDate: "2026-06-10" }),
      expect.objectContaining({ fundCode: "513100", fundName: "纳指ETF", shareClass: "ETF", navPercent: 9.2, reportPeriod: "2026Q1" })
    ]);
  });

  it("enriches on-exchange LOF rows with OTC purchase limits", () => {
    const db = createInMemoryDatabase();
    insertSnapshotBundle(db, {
      syncRunId: "run-1",
      funds: [
        { code: "161128", name: "易方达标普信息科技指数(QDII-LOF)A(人民币)", fundType: "QDII", venue: "on_exchange", shareClass: "LOF", enabled: true }
      ],
      quotes: [],
      limits: [
        { fundCode: "161128", shareClass: "LOF", status: "limited", limitAmountYuan: 100, limitUnit: "per_day", channelScope: "agency", channelId: "eastmoney_aggregate", source: "tiantian-f10-jjfl", dataDate: "2026-06-16", confidence: 0.9, syncRunId: "run-1" }
      ],
      fees: [],
      holdings: [
        { fundCode: "161128", stockCode: "NVDA", stockName: "英伟达", navPercent: 20.16, reportPeriod: "2026Q1", source: "eastmoney", syncRunId: "run-1" }
      ]
    });

    const result = queryStockConcentration(db, "NVDA");

    expect(result.rows[0]).toMatchObject({
      fundCode: "161128",
      venue: "on_exchange",
      shareClass: "LOF",
      purchaseStatus: "limited",
      limitAmountYuan: 100,
      limitUnit: "per_day",
      limitDataDate: "2026-06-16"
    });
  });

  it("dedupes homogeneous index trackers while keeping non-index funds", () => {
    const db = createInMemoryDatabase();
    insertSnapshotBundle(db, {
      syncRunId: "run-1",
      funds: [
        { code: "539002", name: "建信新兴市场混合(QDII)A", fundType: "QDII", venue: "off_exchange", shareClass: "A", enabled: true },
        { code: "513100", name: "纳指ETF", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true },
        { code: "159513", name: "纳斯达克100ETF大成", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true },
        { code: "159632", name: "纳斯达克ETF华安", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true }
      ],
      quotes: [],
      limits: [],
      fees: [],
      holdings: [
        { fundCode: "539002", stockCode: "NVDA", stockName: "英伟达", navPercent: 11.5, reportPeriod: "2026Q1", source: "eastmoney", syncRunId: "run-1" },
        { fundCode: "513100", stockCode: "NVDA", stockName: "NVIDIA Corp", navPercent: 9.2, reportPeriod: "2026Q1", source: "eastmoney", syncRunId: "run-1" },
        { fundCode: "159513", stockCode: "NVDA", stockName: "NVIDIA Corp", navPercent: 9.0, reportPeriod: "2026Q1", source: "eastmoney", syncRunId: "run-1" },
        { fundCode: "159632", stockCode: "NVDA", stockName: "NVIDIA Corp", navPercent: 8.8, reportPeriod: "2026Q1", source: "eastmoney", syncRunId: "run-1" }
      ]
    });

    expect(queryStockConcentration(db, "NVDA").rows.map((row) => row.fundCode)).toEqual(["539002", "513100", "159513"]);
    expect(queryStockConcentration(db, "NVDA", { dedupe: false }).rows.map((row) => row.fundCode)).toEqual([
      "539002", "513100", "159513", "159632"
    ]);
  });

  it("queries stock concentration from stock_fund_index when present", () => {
    const db = createInMemoryDatabase();
    insertSnapshotBundle(db, {
      syncRunId: "run-1",
      funds: [
        { code: "539002", name: "建信新兴市场混合(QDII)A", fundType: "QDII", venue: "off_exchange", shareClass: "A", enabled: true },
        { code: "513100", name: "纳指ETF", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true }
      ],
      quotes: [],
      limits: [],
      fees: [],
      holdings: [
        { fundCode: "539002", stockCode: "NVDA", stockName: "英伟达", navPercent: 11.5, reportPeriod: "2026Q1", source: "eastmoney-f10-jjcc", syncRunId: "run-1" },
        { fundCode: "513100", stockCode: "NVDA", stockName: "NVIDIA Corp", navPercent: 9.2, reportPeriod: "2026Q1", source: "eastmoney-f10-jjcc", syncRunId: "run-1" }
      ]
    });
    rebuildStockFundIndex(db, "run-1");

    expect(queryStockConcentration(db, "NVDA").rows.map((row) => row.fundCode)).toEqual(["539002", "513100"]);
    expect(queryStockConcentration(db, "英伟达").rows.map((row) => row.fundCode)).toEqual(["539002", "513100"]);
  });

  it("resolves HYNIX tab queries against legacy SK海力士 index keys", () => {
    const db = createInMemoryDatabase();
    insertSnapshotBundle(db, {
      syncRunId: "run-1",
      funds: [
        { code: "513310", name: "中韩半导体ETF华泰柏瑞", fundType: "ETF", venue: "on_exchange", shareClass: "ETF", enabled: true },
        { code: "539002", name: "建信新兴市场混合(QDII)A", fundType: "QDII", venue: "off_exchange", shareClass: "A", enabled: true }
      ],
      quotes: [],
      limits: [],
      fees: [],
      holdings: [
        { fundCode: "513310", stockCode: "000660", stockName: "SK海力士", navPercent: 15.53, reportPeriod: "2026Q1", source: "eastmoney-f10-jjcc", syncRunId: "run-1" },
        { fundCode: "539002", stockCode: "000660", stockName: "SK海力士", navPercent: 4.2, reportPeriod: "2026Q1", source: "eastmoney-f10-jjcc", syncRunId: "run-1" }
      ]
    });
    rebuildStockFundIndex(db, "run-1");
    db.prepare(`UPDATE stock_fund_index SET stock_key = 'SK海力士' WHERE stock_key = 'HYNIX'`).run();

    expect(queryStockConcentration(db, "HYNIX").rows.map((row) => row.fundCode)).toEqual(["513310", "539002"]);
    expect(queryStockConcentration(db, "海力士").rows.map((row) => row.fundCode)).toEqual(["513310", "539002"]);
  });

  it("records sync status by data area", () => {
    const db = createInMemoryDatabase();

    recordSyncStatus(db, {
      area: "purchaseLimit",
      status: "ok",
      source: "tiantian-f10-jjfl",
      dataDate: "2026-06-10",
      itemCount: 33,
      freshItemCount: 30,
      cachedItemCount: 3,
      durationMs: 1280,
      updatedAt: "2026-06-10T09:30:00.000Z"
    });
    recordSyncStatus(db, {
      area: "quote",
      status: "error",
      source: "eastmoney-on-exchange-quote",
      dataDate: null,
      itemCount: 0,
      errorCategory: "anti_scraping",
      message: "blocked",
      updatedAt: "2026-06-10T09:31:00.000Z"
    });

    const status = querySyncStatus(db);

    expect(status.purchaseLimit).toMatchObject({
      status: "ok",
      source: "tiantian-f10-jjfl",
      dataDate: "2026-06-10",
      itemCount: 33,
      freshItemCount: 30,
      cachedItemCount: 3,
      durationMs: 1280
    });
    expect(status.quote).toMatchObject({
      status: "error",
      errorCategory: "anti_scraping",
      message: "blocked"
    });
  });

  it("removes stale F10 direct limits when a new limit snapshot is inserted", () => {
    const db = createInMemoryDatabase();
    insertSnapshotBundle(db, {
      syncRunId: "run-1",
      funds: [{ code: "021000", name: "南方I", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "I", enabled: true }],
      quotes: [],
      limits: [
        { fundCode: "021000", shareClass: "I", status: "limited", limitUnit: "per_day", channelScope: "direct", channelId: "nfjj", source: "tiantian-f10-jjfl", dataDate: "2026-06-10", confidence: 0.9, syncRunId: "run-1" },
        { fundCode: "021000", shareClass: "I", status: "limited", limitAmountYuan: 5000, limitUnit: "per_day", channelScope: "agency", channelId: "eastmoney_aggregate", source: "tiantian-f10-jjfl", dataDate: "2026-06-15", confidence: 0.9, syncRunId: "run-2" }
      ],
      fees: [],
      holdings: []
    });
    insertSnapshotBundle(db, {
      syncRunId: "run-2",
      funds: [{ code: "021000", name: "南方I", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "I", enabled: true }],
      quotes: [],
      limits: [
        { fundCode: "021000", shareClass: "I", status: "limited", limitAmountYuan: 5000, limitUnit: "per_day", channelScope: "direct", channelId: "nfjj", source: "fundco-announcement-nfjj", dataDate: "2026-04-08", confidence: 0.95, syncRunId: "run-2" }
      ],
      fees: [],
      holdings: []
    });

    const rows = db.prepare("SELECT channel_scope, source, limit_amount_yuan FROM purchase_limits WHERE fund_code = '021000' ORDER BY channel_scope").all();
    expect(rows).toEqual([
      { channel_scope: "agency", source: "tiantian-f10-jjfl", limit_amount_yuan: 5000 },
      { channel_scope: "direct", source: "fundco-announcement-nfjj", limit_amount_yuan: 5000 }
    ]);
  });
});
