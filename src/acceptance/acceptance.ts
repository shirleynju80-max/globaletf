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
  const comparisons = INDEX_TARGETS.map((target) => ({
    target,
    comparison: queryIndexComparison(db, target.code)
  }));
  const nasdaqComparison = comparisons.find((entry) => entry.target.code === "NASDAQ_100")?.comparison ?? { onExchange: [], offExchange: [] };
  const stockConcentration = queryStockConcentration(db, "NVDA");
  const offExchangeStockConcentration = stockConcentration.filter((row) => row.venue === "off_exchange");
  const offExchangeStockLimitsWithAmounts = offExchangeStockConcentration.filter((row) => row.limitAmountYuan != null);

  const checks: AcceptanceCheck[] = [
    checkStatus(status),
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
      key: "offExchangeLimits",
      ok: nasdaqComparison.offExchange.some((row) => row.limitAmountYuan != null || row.status === "open" || row.status === "limited"),
      message: "At least one off-exchange fund has purchase limit/status data"
    },
    {
      key: "offExchangeFees",
      ok: nasdaqComparison.offExchange.some((row) =>
        row.defaultSubscriptionRate != null ||
        row.managementRate != null ||
        row.custodianRate != null ||
        row.salesServiceRate != null ||
        row.redemptionFeeSummary != null
      ),
      message: "At least one off-exchange fund has fee data"
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
    }
  ];

  return {
    ok: checks.every((check) => check.ok),
    checks
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
