import type Database from "better-sqlite3";
import { queryIndexComparison, queryStockConcentration, querySyncStatus } from "../db/repositories";
import { INDEX_TARGETS } from "../domain/targets";

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
  const stockConcentration = queryStockConcentration(db, "NVDA");
  const nasdaqOnExchangePricedRows = nasdaqComparison.onExchange.filter((row) => row.closePrice != null);
  const nasdaqOffExchangeLimitRows = nasdaqComparison.offExchange.filter((row) => row.limitAmountYuan != null || row.status === "open" || row.status === "limited");
  const nasdaqOffExchangeFeeRows = nasdaqComparison.offExchange.filter((row) =>
    row.defaultSubscriptionRate != null ||
    row.managementRate != null ||
    row.custodianRate != null ||
    row.salesServiceRate != null ||
    row.redemptionFeeSummary != null
  );
  const offExchangeStockConcentration = stockConcentration.filter((row) => row.venue === "off_exchange");
  const offExchangeStockLimitsWithAmounts = offExchangeStockConcentration.filter((row) => row.limitAmountYuan != null);

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
      ok: comparison.onExchange.length > 0 && comparison.offExchange.length > 0,
      message: `${target.code} on-exchange=${comparison.onExchange.length}, off-exchange=${comparison.offExchange.length}`
    })),
    {
      key: "indexComparison",
      ok: nasdaqComparison.onExchange.length > 0 && nasdaqComparison.offExchange.length > 0,
      message: `NASDAQ_100 on-exchange=${nasdaqComparison.onExchange.length}, off-exchange=${nasdaqComparison.offExchange.length}`
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
      key: "offExchangeLimitDataDates",
      ok: nasdaqOffExchangeLimitRows.every((row) => Boolean(row.limitDataDate)),
      message: `NASDAQ_100 off-exchange limit rows with dates=${nasdaqOffExchangeLimitRows.filter((row) => Boolean(row.limitDataDate)).length}/${nasdaqOffExchangeLimitRows.length}`
    },
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
      key: "stockConcentrationPurchaseAvailability",
      ok: offExchangeStockConcentration.every((row) => row.purchaseStatus != null || row.limitAmountYuan != null),
      message: `NVDA off-exchange purchase availability rows=${offExchangeStockConcentration.length}`
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
