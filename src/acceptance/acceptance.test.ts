import { describe, expect, it } from "vitest";
import { createInMemoryDatabase } from "../db/database";
import { insertSnapshotBundle, recordSyncStatus } from "../db/repositories";
import { runAcceptance } from "./acceptance";

describe("acceptance checks", () => {
  it("passes when the MVP data surfaces are populated", () => {
    const db = createAcceptanceDatabase();

    const result = runAcceptance(db);

    expect(result.ok).toBe(true);
    expect(result.checks.every((check) => check.ok)).toBe(true);
  });

  it("fails when stock concentration data is missing", () => {
    const db = createAcceptanceDatabase({ holdings: [] });

    const result = runAcceptance(db);

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      key: "stockConcentration",
      ok: false
    }));
  });

  it("fails when off-exchange stock concentration rows lack purchase availability", () => {
    const db = createAcceptanceDatabase({ limits: [] });

    const result = runAcceptance(db);

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      key: "stockConcentrationPurchaseAvailability",
      ok: false
    }));
  });

  it("fails when off-exchange stock concentration limits lack units", () => {
    const db = createAcceptanceDatabase({
      limits: [{ fundCode: "000834", shareClass: "A", status: "limited", limitAmountYuan: 1000, channelScope: "agency", source: "tiantian-f10-jjfl", dataDate: "2026-06-11", confidence: 0.9, syncRunId: "acceptance-run" }]
    });

    const result = runAcceptance(db);

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      key: "stockConcentrationLimitUnits",
      ok: false
    }));
  });

  it("fails when off-exchange limit rows lack data dates", () => {
    const db = createAcceptanceDatabase({
      limits: [{ fundCode: "000834", shareClass: "A", status: "limited", limitAmountYuan: 1000, limitUnit: "per_day", channelScope: "agency", source: "tiantian-f10-jjfl", dataDate: "", confidence: 0.9, syncRunId: "acceptance-run" }]
    });

    const result = runAcceptance(db);

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      key: "offExchangeLimitDataDates",
      ok: false
    }));
  });

  it("fails when off-exchange fee rows lack data dates", () => {
    const db = createAcceptanceDatabase({
      fees: [{ fundCode: "000834", feeType: "subscription", rate: 0.0012, amountTierLowerBound: 0, channelScope: "agency", source: "tiantian-f10-jjfl", dataDate: "", syncRunId: "acceptance-run" }]
    });

    const result = runAcceptance(db);

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      key: "offExchangeFeeDataDates",
      ok: false
    }));
  });

  it("fails when another configured index target has no fund products", () => {
    const db = createAcceptanceDatabase({ includeOtherIndexTargets: false });

    const result = runAcceptance(db);

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      key: "indexComparison.SP_500",
      ok: false
    }));
  });
});

function createAcceptanceDatabase(overrides: {
  holdings?: Parameters<typeof insertSnapshotBundle>[1]["holdings"];
  limits?: Parameters<typeof insertSnapshotBundle>[1]["limits"];
  fees?: Parameters<typeof insertSnapshotBundle>[1]["fees"];
  includeOtherIndexTargets?: boolean;
} = {}) {
  const includeOtherIndexTargets = overrides.includeOtherIndexTargets ?? true;
  const db = createInMemoryDatabase();
  insertSnapshotBundle(db, {
    syncRunId: "acceptance-run",
    funds: [
      { code: "513100", name: "纳指ETF", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true },
      { code: "000834", name: "纳指100联接A", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "A", enabled: true },
      ...(includeOtherIndexTargets ? [
        { code: "513500", name: "标普500ETF", fundType: "ETF", venue: "on_exchange" as const, trackingTargetCode: "SP_500", shareClass: "ETF" as const, enabled: true },
        { code: "050025", name: "博时标普500ETF联接A", fundType: "QDII", venue: "off_exchange" as const, trackingTargetCode: "SP_500", shareClass: "A" as const, enabled: true },
        { code: "513880", name: "日经225ETF", fundType: "ETF", venue: "on_exchange" as const, trackingTargetCode: "NIKKEI_225", shareClass: "ETF" as const, enabled: true },
        { code: "019449", name: "摩根日经225联接A", fundType: "QDII", venue: "off_exchange" as const, trackingTargetCode: "NIKKEI_225", shareClass: "A" as const, enabled: true },
        { code: "513180", name: "恒生科技指数ETF", fundType: "ETF", venue: "on_exchange" as const, trackingTargetCode: "HSTECH", shareClass: "ETF" as const, enabled: true },
        { code: "012348", name: "华夏恒生科技ETF联接A", fundType: "QDII", venue: "off_exchange" as const, trackingTargetCode: "HSTECH", shareClass: "A" as const, enabled: true }
      ] : [])
    ],
    quotes: [{ fundCode: "513100", closePrice: 1.23, closingPremiumDiscountRate: 0.012, turnover: 120000000, tradeDate: "2026-06-10", source: "eastmoney-on-exchange-quote", syncRunId: "acceptance-run" }],
    limits: overrides.limits ?? [{ fundCode: "000834", shareClass: "A", status: "limited", limitAmountYuan: 1000, limitUnit: "per_day", channelScope: "agency", source: "tiantian-f10-jjfl", dataDate: "2026-06-11", confidence: 0.9, syncRunId: "acceptance-run" }],
    fees: overrides.fees ?? [
      { fundCode: "000834", feeType: "subscription", rate: 0.0012, amountTierLowerBound: 0, channelScope: "agency", source: "tiantian-f10-jjfl", dataDate: "2026-06-11", syncRunId: "acceptance-run" },
      { fundCode: "000834", feeType: "management", rate: 0.008, channelScope: "agency", source: "tiantian-f10-jjfl", dataDate: "2026-06-11", syncRunId: "acceptance-run" }
    ],
    holdings: overrides.holdings ?? [
      { fundCode: "513100", stockCode: "NVDA", stockName: "NVIDIA Corp", navPercent: 9.2, reportPeriod: "2026Q1", source: "eastmoney-f10-jjcc", syncRunId: "acceptance-run" },
      { fundCode: "000834", stockCode: "NVDA", stockName: "NVIDIA Corp", navPercent: 8.8, reportPeriod: "2026Q1", source: "eastmoney-f10-jjcc", syncRunId: "acceptance-run" }
    ]
  });
  for (const area of ["fund", "quote", "purchaseLimit", "fee", "holding"] as const) {
    recordSyncStatus(db, {
      area,
      status: "ok",
      source: "acceptance",
      dataDate: area === "holding" ? "2026Q1" : "2026-06-11",
      itemCount: 1,
      durationMs: 100,
      updatedAt: "2026-06-11T03:00:00.000Z"
    });
  }
  return db;
}
