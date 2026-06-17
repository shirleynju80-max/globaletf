import { describe, expect, it } from "vitest";
import { createInMemoryDatabase } from "../db/database";
import { insertSnapshotBundle, rebuildStockFundIndex, recordFundDiscoveryManifest, recordProviderResults, recordSyncRun, recordSyncStatus, replaceDiscoveryProfileGaps } from "../db/repositories";
import { CATALOG_DIRECT_SHARE_FUNDS, CATALOG_FUNDS } from "../domain/fundCatalog";
import { NASDAQ_ACCEPTANCE_FUNDS } from "./nasdaqAcceptanceFixtures";
import { directChannelForCompany } from "../domain/channels";
import { upsertFundTrackingProfiles } from "../sync/trackingProfileSync";
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

  it("fails when off-exchange stock concentration limits lack data dates", () => {
    const db = createAcceptanceDatabase({
      limits: [{ fundCode: "000834", shareClass: "A", status: "limited", limitAmountYuan: 1000, limitUnit: "per_day", channelScope: "agency", source: "tiantian-f10-jjfl", dataDate: "", confidence: 0.9, syncRunId: "acceptance-run" }]
    });

    const result = runAcceptance(db);

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      key: "stockConcentrationLimitDataDates",
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

  it("fails when on-exchange rows lack turnover", () => {
    const db = createAcceptanceDatabase({
      quotes: [{ fundCode: "513100", closePrice: 1.23, closingPremiumDiscountRate: 0.012, turnover: undefined, tradeDate: "2026-06-10", source: "eastmoney-on-exchange-quote", syncRunId: "acceptance-run" }]
    });

    const result = runAcceptance(db);

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      key: "onExchangeTurnover",
      ok: false
    }));
  });

  it("fails when on-exchange previous-close reference rows lack source context", () => {
    const db = createAcceptanceDatabase({
      quotes: [{ fundCode: "513100", closePrice: 1.23, closingPremiumDiscountRate: null, turnover: 120000000, tradeDate: "2026-06-10", source: "", syncRunId: "acceptance-run" }]
    });

    const result = runAcceptance(db);

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      key: "onExchangePremiumDiscountContext",
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

  it("fails when curated Nasdaq 100 on-exchange coverage gaps are missing", () => {
    const db = createAcceptanceDatabase({ includeNasdaqCoverageSeeds: false });

    const result = runAcceptance(db);

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      key: "indexComparison.NASDAQ_100.coverageSeeds",
      ok: false
    }));
  });

  it("fails when curated stock concentration scan funds are missing", () => {
    const db = createAcceptanceDatabase({ includeStockScanFunds: false });

    const result = runAcceptance(db);

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      key: "stockScanUniverse.539002",
      ok: false
    }));
  });

  it("fails when sync audit rows are missing", () => {
    const db = createAcceptanceDatabase({ includeSyncAudit: false });

    const result = runAcceptance(db);

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      key: "syncAudit",
      ok: false
    }));
  });

  it("fails when the latest sync run lacks provider attempts", () => {
    const db = createAcceptanceDatabase();
    recordSyncRun(db, {
      syncRunId: "later-run",
      status: "completed",
      startedAt: "2026-06-11T04:00:00.000Z",
      completedAt: "2026-06-11T04:00:01.000Z"
    });

    const result = runAcceptance(db);

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      key: "syncAudit",
      ok: false
    }));
  });

  it("fails when discovery manifest is missing profile-backed on-exchange ETFs", () => {
    const db = createAcceptanceDatabase();
    recordFundDiscoveryManifest(db, "acceptance-run", [], "2026-06-11T03:00:00.000Z");

    const result = runAcceptance(db);

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      key: "discoveryManifest.NASDAQ_100",
      ok: false
    }));
  });

  it("fails when catalog I/F funds lack fund-company direct limit rows", () => {
    const db = createAcceptanceDatabase({
      limits: [
        { fundCode: "000834", shareClass: "A", status: "limited", limitAmountYuan: 1000, limitUnit: "per_day", channelScope: "agency", source: "tiantian-f10-jjfl", dataDate: "2026-06-11", confidence: 0.9, syncRunId: "acceptance-run" }
      ]
    });

    const result = runAcceptance(db);

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      key: "catalogDirectShareLimits",
      ok: false
    }));
  });

  it("fails when required sync statuses lack freshness metadata", () => {
    const db = createAcceptanceDatabase({
      syncStatusOverrides: {
        purchaseLimit: { dataDate: null, durationMs: null }
      }
    });

    const result = runAcceptance(db);

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      key: "syncStatusMetadata",
      ok: false
    }));
  });
});

function createAcceptanceDatabase(overrides: {
  quotes?: Parameters<typeof insertSnapshotBundle>[1]["quotes"];
  holdings?: Parameters<typeof insertSnapshotBundle>[1]["holdings"];
  limits?: Parameters<typeof insertSnapshotBundle>[1]["limits"];
  fees?: Parameters<typeof insertSnapshotBundle>[1]["fees"];
  includeOtherIndexTargets?: boolean;
  includeSyncAudit?: boolean;
  syncStatusOverrides?: Partial<Record<"fund" | "quote" | "purchaseLimit" | "fee" | "holding", Partial<Parameters<typeof recordSyncStatus>[1]>>>;
  includeNasdaqCoverageSeeds?: boolean;
  includeStockScanFunds?: boolean;
} = {}) {
  const includeOtherIndexTargets = overrides.includeOtherIndexTargets ?? true;
  const includeSyncAudit = overrides.includeSyncAudit ?? true;
  const db = createInMemoryDatabase();
  // Drop one curated ETF when simulating a coverage gap; otherwise include the full
  // authoritative Nasdaq 100 catalog so the curated coverage checks reflect real syncs.
  const nasdaqCatalog = overrides.includeNasdaqCoverageSeeds === false
    ? NASDAQ_ACCEPTANCE_FUNDS.filter((fund) => fund.code !== "159632")
    : [...NASDAQ_ACCEPTANCE_FUNDS, ...CATALOG_FUNDS.filter((fund) => !NASDAQ_ACCEPTANCE_FUNDS.some((seed) => seed.code === fund.code))];
  const otherIndexFunds = includeOtherIndexTargets ? [
    { code: "513500", name: "标普500ETF", fundType: "ETF", venue: "on_exchange" as const, trackingTargetCode: "SP_500", shareClass: "ETF" as const, enabled: true },
    { code: "050025", name: "博时标普500ETF联接A", fundType: "QDII", venue: "off_exchange" as const, trackingTargetCode: "SP_500", shareClass: "A" as const, enabled: true },
    { code: "513880", name: "日经225ETF", fundType: "ETF", venue: "on_exchange" as const, trackingTargetCode: "NIKKEI_225", shareClass: "ETF" as const, enabled: true },
    { code: "513520", name: "日经ETF", fundType: "ETF", venue: "on_exchange" as const, trackingTargetCode: "NIKKEI_225", shareClass: "ETF" as const, enabled: true },
    { code: "513000", name: "日经225ETF易方达", fundType: "ETF", venue: "on_exchange" as const, trackingTargetCode: "NIKKEI_225", shareClass: "ETF" as const, enabled: true },
    { code: "019449", name: "摩根日经225联接A", fundType: "QDII", venue: "off_exchange" as const, trackingTargetCode: "NIKKEI_225", shareClass: "A" as const, enabled: true },
    { code: "513180", name: "恒生科技指数ETF", fundType: "ETF", venue: "on_exchange" as const, trackingTargetCode: "HSTECH", shareClass: "ETF" as const, enabled: true },
    { code: "513010", name: "恒生科技ETF", fundType: "ETF", venue: "on_exchange" as const, trackingTargetCode: "HSTECH", shareClass: "ETF" as const, enabled: true },
    { code: "012348", name: "华夏恒生科技ETF联接A", fundType: "QDII", venue: "off_exchange" as const, trackingTargetCode: "HSTECH", shareClass: "A" as const, enabled: true }
  ] : [];
  const stockScanFunds = overrides.includeStockScanFunds === false ? [] : [
    { code: "539002", name: "建信新兴市场混合(QDII)A", fundType: "QDII-混合偏股", venue: "off_exchange" as const, shareClass: "A" as const, enabled: true }
  ];
  const allFunds = [...nasdaqCatalog, ...stockScanFunds, ...otherIndexFunds];
  insertSnapshotBundle(db, {
    syncRunId: "acceptance-run",
    funds: allFunds,
    quotes: overrides.quotes ?? [{ fundCode: "513100", closePrice: 1.23, closingPremiumDiscountRate: 0.012, turnover: 120000000, tradeDate: "2026-06-10", source: "eastmoney-on-exchange-quote", syncRunId: "acceptance-run" }],
    limits: overrides.limits ?? [
      { fundCode: "000834", shareClass: "A", status: "limited", limitAmountYuan: 1000, limitUnit: "per_day", channelScope: "agency", source: "tiantian-f10-jjfl", dataDate: "2026-06-11", confidence: 0.9, syncRunId: "acceptance-run" },
      ...catalogDirectShareLimitFixtures(),
      ...(overrides.includeStockScanFunds === false ? [] : [
        { fundCode: "539002", shareClass: "A" as const, status: "limited" as const, limitAmountYuan: 10, limitUnit: "per_day" as const, channelScope: "agency" as const, source: "tiantian-f10-jjfl", dataDate: "2026-06-11", confidence: 0.9, syncRunId: "acceptance-run" }
      ])
    ],
    fees: overrides.fees ?? [
      { fundCode: "000834", feeType: "subscription", rate: 0.0012, amountTierLowerBound: 0, channelScope: "agency", source: "tiantian-f10-jjfl", dataDate: "2026-06-11", syncRunId: "acceptance-run" },
      { fundCode: "000834", feeType: "management", rate: 0.008, channelScope: "agency", source: "tiantian-f10-jjfl", dataDate: "2026-06-11", syncRunId: "acceptance-run" }
    ],
    holdings: overrides.holdings ?? [
      { fundCode: "513100", stockCode: "NVDA", stockName: "NVIDIA Corp", navPercent: 9.2, reportPeriod: "2026Q1", source: "eastmoney-f10-jjcc", syncRunId: "acceptance-run" },
      { fundCode: "000834", stockCode: "NVDA", stockName: "NVIDIA Corp", navPercent: 8.8, reportPeriod: "2026Q1", source: "eastmoney-f10-jjcc", syncRunId: "acceptance-run" },
      ...(overrides.includeStockScanFunds === false ? [] : [
        { fundCode: "539002", stockCode: "NVDA", stockName: "NVIDIA Corp", navPercent: 11.5, reportPeriod: "2026Q1", source: "eastmoney-f10-jjcc", syncRunId: "acceptance-run" }
      ])
    ]
  });
  rebuildStockFundIndex(db, "acceptance-run");
  recordFundDiscoveryManifest(
    db,
    "acceptance-run",
    allFunds
      .filter((fund) => fund.trackingTargetCode)
      .map((fund) => ({
        ...fund,
        discoverySource: fund.venue === "on_exchange" ? "tracking-profile" : "catalog-seed"
      })),
    "2026-06-11T03:00:00.000Z"
  );
  replaceDiscoveryProfileGaps(db, "acceptance-run", [], "2026-06-11T03:00:00.000Z");
  for (const area of ["fund", "quote", "purchaseLimit", "fee", "holding"] as const) {
    const statusOverride = overrides.syncStatusOverrides?.[area] ?? {};
    recordSyncStatus(db, {
      area,
      status: "ok",
      source: "acceptance",
      dataDate: area === "holding" ? "2026Q1" : "2026-06-11",
      itemCount: 1,
      durationMs: 100,
      updatedAt: "2026-06-11T03:00:00.000Z",
      ...statusOverride
    });
  }
  if (includeSyncAudit) {
    recordSyncRun(db, {
      syncRunId: "acceptance-run",
      status: "completed",
      startedAt: "2026-06-11T03:00:00.000Z",
      completedAt: "2026-06-11T03:00:01.000Z"
    });
    recordProviderResults(db, [
      {
        syncRunId: "acceptance-run",
        area: "quote",
        attemptOrder: 1,
        providerName: "acceptance-provider",
        ok: true,
        confidence: 0.9,
        fetchedAt: "2026-06-11T03:00:00.500Z",
        dataDate: "2026-06-10"
      }
    ]);
  }
  upsertFundTrackingProfiles(db, allFunds
    .filter((fund) => fund.trackingTargetCode)
    .map((fund) => ({
      fundCode: fund.code,
      trackingIndex: trackingIndexLabel(fund.trackingTargetCode!),
      benchmark: `${trackingIndexLabel(fund.trackingTargetCode!)}收益率`,
      verifiedOk: true,
      verifiedAt: "2026-06-11T03:00:00.000Z"
    })));
  return db;
}

function trackingIndexLabel(targetCode: string): string {
  switch (targetCode) {
    case "SP_500": return "标普500指数";
    case "NIKKEI_225": return "日经225指数";
    case "HSTECH": return "恒生科技指数";
    default: return "纳斯达克100指数";
  }
}

function catalogDirectShareLimitFixtures(): Parameters<typeof insertSnapshotBundle>[1]["limits"] {
  return CATALOG_DIRECT_SHARE_FUNDS.map((fund) => {
    const channelId = directChannelForCompany(fund.fundCompany);
    return {
      fundCode: fund.code,
      shareClass: fund.shareClass,
      status: "limited" as const,
      limitAmountYuan: fund.shareClass === "I" ? 5000 : 1000,
      limitUnit: "per_day" as const,
      channelScope: "direct" as const,
      channelId,
      source: `fundco-announcement-${channelId}`,
      dataDate: "2026-06-11",
      confidence: 0.9,
      syncRunId: "acceptance-run"
    };
  });
}
