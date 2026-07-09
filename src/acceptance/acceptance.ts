import type Database from "better-sqlite3";
import { queryIndexComparison, queryStockConcentration, querySyncStatus, queryDiscoveryCoverageGaps, queryDiscoveryManifestOrphans, queryDiscoveryProfileGaps, queryFundDiscoveryManifest } from "../db/repositories";
import type { StockConcentrationRow } from "../db/repositories";
import { CATALOG_FUNDS, CATALOG_DIRECT_SHARE_FUNDS } from "../domain/fundCatalog";
import { INDEX_TARGETS, INDEX_TARGET_FUND_SEEDS } from "../domain/targets";
import { INDEX_TARGETS_PENDING_UNTIL_FUNDS, indexTargetHasFunds } from "../domain/indexTargetAvailability";
import { STOCK_SCAN_FUNDS } from "../domain/stockScanUniverse";
import { countStockIndexFunds } from "../sync/stockHoldingIndexSync";
import { queryFundTrackingProfileMismatches } from "../sync/trackingProfileSync";

export interface AcceptanceCheck {
  key: string;
  ok: boolean;
  message: string;
}

export interface AcceptanceResult {
  ok: boolean;
  checks: AcceptanceCheck[];
}

export function runAcceptance(db: Database.Database): AcceptanceResult {
  const status = querySyncStatus(db);
  const syncAudit = querySyncAuditSummary(db);
  const comparisons = INDEX_TARGETS.map((target) => ({
    target,
    comparison: queryIndexComparison(db, target.code)
  }));
  const nasdaqComparison = comparisons.find((entry) => entry.target.code === "NASDAQ_100")?.comparison ?? { onExchange: [], offExchange: [] };
  const nikkeiComparison = comparisons.find((entry) => entry.target.code === "NIKKEI_225")?.comparison ?? { onExchange: [], offExchange: [] };
  const stockConcentration = queryStockConcentration(db, "NVDA").rows;
  const nasdaqOnExchangePricedRows = nasdaqComparison.onExchange.filter((row) => row.closePrice != null);
  const nasdaqOffExchangeLimitRows = nasdaqComparison.offExchange.filter((row) => row.limitAmount != null || row.limitAmountYuan != null || row.status === "open" || row.status === "limited");
  const nasdaqOffExchangeFeeRows = nasdaqComparison.offExchange.filter((row) =>
    row.defaultSubscriptionRate != null ||
    row.managementRate != null ||
    row.custodianRate != null ||
    row.salesServiceRate != null ||
    row.redemptionFeeSummary != null
  );
  const offExchangeStockConcentration = stockConcentration.filter((row) => row.venue === "off_exchange");
  const strictStockPurchaseAvailabilityRows = offExchangeStockConcentration.filter(requiresStockPurchaseAvailabilityCoverage);
  const offExchangeStockLimitsWithAmounts = offExchangeStockConcentration.filter((row) => row.limitAmount != null || row.limitAmountYuan != null);

  const checks: AcceptanceCheck[] = [
    checkStatus(status),
    checkStatusMetadata(status),
    {
      key: "syncAudit",
      ok: syncAudit.syncRunCount > 0 &&
        syncAudit.latestRunStatus === "completed" &&
        syncAudit.latestRunProviderResultCount > 0 &&
        syncAudit.latestRunProviderResultsWithFetchedAt === syncAudit.latestRunProviderResultCount,
      message: `sync runs=${syncAudit.syncRunCount}, latest status=${syncAudit.latestRunStatus ?? "none"}, latest provider attempts=${syncAudit.latestRunProviderResultCount}, attempts with fetched time=${syncAudit.latestRunProviderResultsWithFetchedAt}`
    },
    ...comparisons.map(({ target, comparison }) => ({
      key: `indexComparison.${target.code}`,
      ok: isActiveIndexTargetComparisonReady(target.code, comparison),
      message: `${target.code} on-exchange=${comparison.onExchange.length}, off-exchange=${comparison.offExchange.length}`
    })),
    ...comparisons.flatMap(({ target, comparison }) => {
      const seedCodes = INDEX_TARGET_FUND_SEEDS[target.code] ?? [];
      if (seedCodes.length === 0) return [];
      const presentCodes = new Set([...comparison.onExchange, ...comparison.offExchange].map((row) => row.code));
      const missingCodes = seedCodes.filter((code) => !presentCodes.has(code));
      return [{
        key: `indexComparison.${target.code}.coverageSeeds`,
        ok: missingCodes.length === 0,
        message: `${target.code} curated seed coverage missing=${missingCodes.join(",") || "none"}`
      }];
    }),
    {
      key: "indexComparison",
      ok: nasdaqComparison.onExchange.length > 0 && nasdaqComparison.offExchange.length > 0,
      message: `NASDAQ_100 on-exchange=${nasdaqComparison.onExchange.length}, off-exchange=${nasdaqComparison.offExchange.length}`
    },
    {
      key: "onExchangeEtfCoverage",
      ok: nasdaqComparison.onExchange.filter((row) => row.shareClass === "ETF").length >= 12,
      message: `NASDAQ_100 on-exchange ETF count=${nasdaqComparison.onExchange.filter((row) => row.shareClass === "ETF").length} (expect >= 12)`
    },
    {
      key: "onExchangeNikkeiEtfCoverage",
      ok: nikkeiComparison.onExchange.filter((row) => row.shareClass === "ETF").length >= 3,
      message: `NIKKEI_225 on-exchange ETF count=${nikkeiComparison.onExchange.filter((row) => row.shareClass === "ETF").length} (expect >= 3)`
    },
    ...INDEX_TARGETS.map((target) => checkDiscoveryManifestForTarget(db, target.code)),
    ...INDEX_TARGETS.map((target) => checkDiscoveryProfileGapsForTarget(db, target.code)),
    {
      key: "trackingProfiles",
      ok: queryFundTrackingProfileMismatches(db, trackingProfileFundCodes(db)).length === 0,
      message: `discovery-backed tracking profile mismatches=${queryFundTrackingProfileMismatches(db, trackingProfileFundCodes(db)).join(",") || "none"}`
    },
    {
      key: "onExchangeQuotes",
      ok: nasdaqComparison.onExchange.some((row) => row.closePrice != null && row.tradeDate),
      message: "At least one on-exchange ETF has close price and trade date"
    },
    {
      key: "onExchangeTurnover",
      ok: nasdaqComparison.onExchange.some((row) => row.turnover != null),
      message: "At least one on-exchange ETF has turnover for liquidity context"
    },
    {
      key: "onExchangePremiumDiscountContext",
      ok: nasdaqOnExchangePricedRows.length > 0 && nasdaqOnExchangePricedRows.every((row) => Boolean(row.tradeDate) && Boolean(row.source)),
      message: `NASDAQ_100 priced on-exchange rows with previous-close context=${nasdaqOnExchangePricedRows.filter((row) => Boolean(row.tradeDate) && Boolean(row.source)).length}/${nasdaqOnExchangePricedRows.length}, premium rates=${nasdaqOnExchangePricedRows.filter((row) => row.closingPremiumDiscountRate != null).length}`
    },
    {
      key: "offExchangeLimits",
      ok: nasdaqOffExchangeLimitRows.length > 0,
      message: "At least one off-exchange fund has purchase limit/status data"
    },
    {
      key: "offExchangeKnownLimits",
      ok: nasdaqOffExchangeLimitRows.every((row) => row.status !== "unknown"),
      message: `NASDAQ_100 off-exchange rows with known purchase status=${nasdaqOffExchangeLimitRows.filter((row) => row.status !== "unknown").length}/${nasdaqOffExchangeLimitRows.length}`
    },
    {
      key: "offExchangeLimitDataDates",
      ok: nasdaqOffExchangeLimitRows.every((row) => Boolean(row.limitEffectiveDate ?? row.limitDataDate)),
      message: `NASDAQ_100 off-exchange limit rows with effective dates=${nasdaqOffExchangeLimitRows.filter((row) => Boolean(row.limitEffectiveDate ?? row.limitDataDate)).length}/${nasdaqOffExchangeLimitRows.length}`
    },
    {
      key: "offExchangeLimitSyncDates",
      ok: nasdaqOffExchangeLimitRows.every((row) => Boolean(row.limitSyncedAt)),
      message: `NASDAQ_100 off-exchange limit rows with sync dates=${nasdaqOffExchangeLimitRows.filter((row) => Boolean(row.limitSyncedAt)).length}/${nasdaqOffExchangeLimitRows.length}`
    },
    {
      key: "offExchangeLimitConflicts",
      ok: nasdaqOffExchangeLimitRows.every((row) => !row.limitStatusConflict),
      message: `NASDAQ_100 off-exchange limit status conflicts=${nasdaqOffExchangeLimitRows.filter((row) => row.limitStatusConflict).length}`
    },
    checkCatalogDirectShareLimits(db),
    {
      key: "offExchangeFees",
      ok: nasdaqOffExchangeFeeRows.length > 0,
      message: "At least one off-exchange fund has fee data"
    },
    {
      key: "offExchangeFeeDataDates",
      ok: nasdaqOffExchangeFeeRows.every((row) => Boolean(row.feeDataDate)),
      message: `NASDAQ_100 off-exchange fee rows with dates=${nasdaqOffExchangeFeeRows.filter((row) => Boolean(row.feeDataDate)).length}/${nasdaqOffExchangeFeeRows.length}`
    },
    {
      key: "stockConcentration",
      ok: stockConcentration.length > 0 && stockConcentration[0].navPercent > 0,
      message: `NVDA concentration rows=${stockConcentration.length}`
    },
    {
      key: "stockFundIndex",
      ok: countStockIndexFunds(db, "NVDA") > 0,
      message: `NVDA stock_fund_index funds=${countStockIndexFunds(db, "NVDA")}`
    },
    ...STOCK_SCAN_FUNDS.map((fund) => {
      const row = db.prepare("SELECT enabled FROM funds WHERE code = ?").get(fund.code) as { enabled: number } | undefined;
      return {
        key: `stockScanUniverse.${fund.code}`,
        ok: row?.enabled === 1,
        message: `${fund.code} stock scan fund enabled=${row?.enabled === 1 ? "yes" : "no"}`
      };
    }),
    {
      key: "stockConcentrationPurchaseAvailability",
      ok: strictStockPurchaseAvailabilityRows.every(hasStockPurchaseAvailabilityCoverage),
      message: `NVDA off-exchange purchase availability rows=${offExchangeStockConcentration.length}, strict=${strictStockPurchaseAvailabilityRows.length}, covered=${offExchangeStockConcentration.filter(hasStockPurchaseAvailabilityCoverage).length}, unknown=${offExchangeStockConcentration.filter((row) => row.purchaseStatus === "unknown").length}`
    },
    {
      key: "stockConcentrationLimitUnits",
      ok: offExchangeStockLimitsWithAmounts.every((row) => row.limitUnit === "per_day" || row.limitUnit === "per_order"),
      message: `NVDA off-exchange numeric limit rows=${offExchangeStockLimitsWithAmounts.length}`
    },
    {
      key: "stockConcentrationLimitDataDates",
      ok: offExchangeStockLimitsWithAmounts.every((row) => Boolean(row.limitDataDate)),
      message: `NVDA off-exchange numeric limit rows with dates=${offExchangeStockLimitsWithAmounts.filter((row) => Boolean(row.limitDataDate)).length}/${offExchangeStockLimitsWithAmounts.length}`
    }
  ];

  return {
    ok: checks.every((check) => check.ok),
    checks
  };
}

function requiresStockPurchaseAvailabilityCoverage(row: StockConcentrationRow): boolean {
  return row.trackingTargetCode != null || STOCK_SCAN_FUNDS.some((fund) => fund.code === row.fundCode);
}

function hasStockPurchaseAvailabilityCoverage(row: StockConcentrationRow): boolean {
  if (row.limitAmount != null) return true;
  if (row.limitAmountYuan != null) return true;
  if (row.purchaseStatus == null) return false;
  if (row.purchaseStatus !== "unknown") return true;
  return Boolean(row.limitDataDate ?? row.limitEffectiveDate ?? row.limitSyncedAt);
}

function isActiveIndexTargetComparisonReady(
  targetCode: string,
  comparison: { onExchange: unknown[]; offExchange: unknown[] }
): boolean {
  if (INDEX_TARGETS_PENDING_UNTIL_FUNDS.has(targetCode) && !indexTargetHasFunds(comparison)) {
    return true;
  }
  return comparison.onExchange.length > 0 && comparison.offExchange.length > 0;
}

function checkDiscoveryManifestForTarget(db: Database.Database, targetCode: string): AcceptanceCheck {
  const comparison = queryIndexComparison(db, targetCode);
  if (INDEX_TARGETS_PENDING_UNTIL_FUNDS.has(targetCode) && !indexTargetHasFunds(comparison)) {
    return {
      key: `discoveryManifest.${targetCode}`,
      ok: true,
      message: `${targetCode} pending until tracked funds exist`
    };
  }

  const manifest = queryFundDiscoveryManifest(db).filter((row) => row.trackingTargetCode === targetCode);
  const onExchangeManifest = manifest.filter((row) => row.venue === "on_exchange" && (row.shareClass === "ETF" || row.shareClass === "LOF"));
  const automatedOnExchange = onExchangeManifest.filter((row) => row.discoverySource !== "catalog-seed");
  const profileBacked = onExchangeManifest.filter((row) =>
    row.discoverySource === "tracking-profile" ||
    row.discoverySource === "screener-name" ||
    row.discoverySource === "fund-family"
  );
  const coverageGaps = queryDiscoveryCoverageGaps(db, targetCode);
  const orphans = queryDiscoveryManifestOrphans(db, targetCode);

  return {
    key: `discoveryManifest.${targetCode}`,
    ok: manifest.length > 0 &&
      coverageGaps.length === 0 &&
      orphans.length === 0 &&
      automatedOnExchange.length > 0 &&
      profileBacked.length > 0,
    message: `${targetCode} manifest=${manifest.length}, on-exchange=${onExchangeManifest.length}, automated-on-exchange=${automatedOnExchange.length}, profile/screener=${profileBacked.length}, enabled-gaps=${coverageGaps.join(",") || "none"}, orphans=${orphans.join(",") || "none"}`
  };
}

function checkDiscoveryProfileGapsForTarget(db: Database.Database, targetCode: string): AcceptanceCheck {
  const comparison = queryIndexComparison(db, targetCode);
  if (INDEX_TARGETS_PENDING_UNTIL_FUNDS.has(targetCode) && !indexTargetHasFunds(comparison)) {
    return {
      key: `discoveryProfileGaps.${targetCode}`,
      ok: true,
      message: `${targetCode} pending until tracked funds exist`
    };
  }

  const gaps = queryDiscoveryProfileGaps(db, targetCode);
  return {
    key: `discoveryProfileGaps.${targetCode}`,
    ok: gaps.length === 0,
    message: `${targetCode} profile-verified gaps=${gaps.map((gap) => gap.fundCode).join(",") || "none"}`
  };
}

function trackingProfileFundCodes(db: Database.Database): string[] {
  const manifestCodes = queryFundDiscoveryManifest(db).map((row) => row.fundCode);
  return manifestCodes.length > 0 ? manifestCodes : CATALOG_FUNDS.map((fund) => fund.code);
}

function checkCatalogDirectShareLimits(db: Database.Database): AcceptanceCheck {
  const missing = queryCatalogDirectShareLimitGaps(db);
  return {
    key: "catalogDirectShareLimits",
    ok: missing.length === 0,
    message: `catalog I/F fundco direct limits missing=${missing.join(",") || "none"} (${CATALOG_DIRECT_SHARE_FUNDS.length} expected)`
  };
}

export function queryCatalogDirectShareLimitGaps(db: Database.Database): string[] {
  const hasDirectLimit = db.prepare(`
    SELECT 1
    FROM purchase_limits
    WHERE fund_code = ? AND share_class = ? AND channel_scope = 'direct'
      AND source LIKE 'fundco-%' AND data_date IS NOT NULL AND data_date <> ''
      AND status IN ('open', 'limited', 'suspended')
    LIMIT 1
  `);
  return CATALOG_DIRECT_SHARE_FUNDS
    .filter((fund) => !hasDirectLimit.get(fund.code, fund.shareClass))
    .map((fund) => fund.code);
}

function checkStatusMetadata(status: ReturnType<typeof querySyncStatus>): AcceptanceCheck {
  const requiredAreas = ["fund", "quote", "purchaseLimit", "fee", "holding"] as const;
  const complete = requiredAreas.filter((area) => {
    const row = status[area];
    return Boolean(row?.source) &&
      Boolean(row?.dataDate) &&
      Boolean(row?.updatedAt) &&
      row?.itemCount != null &&
      row.itemCount > 0 &&
      row.durationMs != null;
  });

  return {
    key: "syncStatusMetadata",
    ok: complete.length === requiredAreas.length,
    message: `required status metadata=${complete.length}/${requiredAreas.length}`
  };
}

function querySyncAuditSummary(db: Database.Database): {
  syncRunCount: number;
  latestRunStatus: string | null;
  latestRunProviderResultCount: number;
  latestRunProviderResultsWithFetchedAt: number;
} {
  const syncRuns = db.prepare("SELECT COUNT(*) AS count FROM sync_runs").get() as { count: number };
  const latestRun = db.prepare(`
    SELECT sync_run_id AS syncRunId, status
    FROM sync_runs
    ORDER BY started_at DESC
    LIMIT 1
  `).get() as { syncRunId: string; status: string } | undefined;
  const providerResults = db.prepare(`
    SELECT
      COUNT(*) AS count,
      SUM(CASE WHEN fetched_at IS NOT NULL AND fetched_at <> '' THEN 1 ELSE 0 END) AS withFetchedAt
    FROM provider_results
    WHERE sync_run_id = ?
  `).get(latestRun?.syncRunId ?? "") as { count: number; withFetchedAt: number | null };

  return {
    syncRunCount: syncRuns.count,
    latestRunStatus: latestRun?.status ?? null,
    latestRunProviderResultCount: providerResults.count,
    latestRunProviderResultsWithFetchedAt: providerResults.withFetchedAt ?? 0
  };
}

function checkStatus(status: ReturnType<typeof querySyncStatus>): AcceptanceCheck {
  const requiredAreas = ["fund", "quote", "purchaseLimit", "fee", "holding"] as const;
  const missing = requiredAreas.filter((area) => !status[area]);
  const errors = requiredAreas.filter((area) => status[area]?.status === "error");

  return {
    key: "syncStatus",
    ok: missing.length === 0 && errors.length === 0,
    message: `required=${requiredAreas.length}, missing=${missing.join(",") || "none"}, errors=${errors.join(",") || "none"}`
  };
}
