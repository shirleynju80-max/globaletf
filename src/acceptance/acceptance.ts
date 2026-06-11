import type Database from "better-sqlite3";
import { queryIndexComparison, queryStockConcentration, querySyncStatus } from "../db/repositories";

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
  const comparison = queryIndexComparison(db, "NASDAQ_100");
  const stockConcentration = queryStockConcentration(db, "NVDA");

  const checks: AcceptanceCheck[] = [
    checkStatus(status),
    {
      key: "indexComparison",
      ok: comparison.onExchange.length > 0 && comparison.offExchange.length > 0,
      message: `NASDAQ_100 on-exchange=${comparison.onExchange.length}, off-exchange=${comparison.offExchange.length}`
    },
    {
      key: "onExchangeQuotes",
      ok: comparison.onExchange.some((row) => row.closePrice != null && row.tradeDate),
      message: "At least one on-exchange ETF has close price and trade date"
    },
    {
      key: "offExchangeLimits",
      ok: comparison.offExchange.some((row) => row.limitAmountYuan != null || row.status === "open" || row.status === "limited"),
      message: "At least one off-exchange fund has purchase limit/status data"
    },
    {
      key: "offExchangeFees",
      ok: comparison.offExchange.some((row) =>
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
