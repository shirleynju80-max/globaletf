import { matchesStockTarget, stockTargetLookupKeys } from "./holdings";
import { STOCK_TARGETS } from "./targets";
import type { FundHolding } from "./types";

export interface StockFundIndexRow {
  stockKey: string;
  fundCode: string;
  stockCode: string;
  stockName: string;
  navPercent: number;
  holdingMarketValue?: number | null;
  reportPeriod: string;
  source: string;
  syncRunId: string;
}

export function canonicalStockKey(stockCode: string, stockName: string): string | null {
  for (const target of STOCK_TARGETS) {
    if (matchesStockTarget({ targetCode: target.code, stockCode, stockName })) {
      return target.code;
    }
  }

  const normalizedCode = stockCode.trim().toUpperCase();
  if (/^[A-Z]{1,5}$/.test(normalizedCode)) return normalizedCode;

  const normalizedName = stockName.trim().toUpperCase();
  return normalizedName ? normalizedName : null;
}

export function latestReportPeriodByFund(holdings: FundHolding[]): Map<string, string> {
  const latest = new Map<string, string>();
  for (const holding of holdings) {
    const current = latest.get(holding.fundCode);
    if (!current || holding.reportPeriod > current) {
      latest.set(holding.fundCode, holding.reportPeriod);
    }
  }
  return latest;
}

export function buildStockFundIndexRows(holdings: FundHolding[]): StockFundIndexRow[] {
  const latestByFund = latestReportPeriodByFund(holdings);
  const deduped = new Map<string, StockFundIndexRow>();

  for (const holding of holdings) {
    if (holding.reportPeriod !== latestByFund.get(holding.fundCode)) continue;
    const stockKey = canonicalStockKey(holding.stockCode, holding.stockName);
    if (!stockKey) continue;

    const key = `${stockKey}:${holding.fundCode}:${holding.reportPeriod}:${holding.source}`;
    deduped.set(key, {
      stockKey,
      fundCode: holding.fundCode,
      stockCode: holding.stockCode,
      stockName: holding.stockName,
      navPercent: holding.navPercent,
      holdingMarketValue: holding.holdingMarketValue,
      reportPeriod: holding.reportPeriod,
      source: holding.source,
      syncRunId: holding.syncRunId
    });
  }

  return [...deduped.values()];
}

export function lookupStockKey(stockCode: string): string {
  const preset = STOCK_TARGETS.find((target) =>
    matchesStockTarget({ targetCode: target.code, stockCode, stockName: stockCode })
  );
  return preset?.code ?? stockCode.trim().toUpperCase();
}

export function stockIndexLookupKeys(stockKey: string): string[] {
  return stockTargetLookupKeys(stockKey);
}
