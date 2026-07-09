import type { FundReturnPeriod } from "./fundReturnPeriods";
import type { StockConcentrationRow } from "../db/repositories";
import type { FundReturnSnapshot } from "./fundReturnPeriods";

export type StockConcentrationSortKey = FundReturnPeriod | "limit" | "navPercent";

export function limitSortValue(row: StockConcentrationRow): number | null {
  if (row.purchaseStatus === "open") return Number.POSITIVE_INFINITY;
  if (row.limitAmount != null && Number.isFinite(row.limitAmount)) return row.limitAmount;
  if (row.limitAmountYuan != null && Number.isFinite(row.limitAmountYuan)) return row.limitAmountYuan;
  if (row.purchaseStatus === "limited") return 0;
  if (row.purchaseStatus === "suspended") return Number.NEGATIVE_INFINITY;
  return null;
}

export function sortStockConcentrationRows(
  rows: StockConcentrationRow[],
  returnsByCode: Record<string, FundReturnSnapshot | undefined>,
  sortKey: StockConcentrationSortKey,
  sortDesc: boolean
): StockConcentrationRow[] {
  const sorted = [...rows].sort((a, b) => compareRows(a, b, returnsByCode, sortKey, sortDesc));
  return sorted;
}

function compareRows(
  a: StockConcentrationRow,
  b: StockConcentrationRow,
  returnsByCode: Record<string, FundReturnSnapshot | undefined>,
  sortKey: StockConcentrationSortKey,
  sortDesc: boolean
): number {
  const valueA = sortValue(a, returnsByCode, sortKey);
  const valueB = sortValue(b, returnsByCode, sortKey);
  const cmp = compareNullableNumbers(valueA, valueB);
  return sortDesc ? -cmp : cmp;
}

function sortValue(
  row: StockConcentrationRow,
  returnsByCode: Record<string, FundReturnSnapshot | undefined>,
  sortKey: StockConcentrationSortKey
): number | null {
  if (sortKey === "limit") return limitSortValue(row);
  if (sortKey === "navPercent") return row.navPercent;
  return returnsByCode[row.fundCode]?.returns[sortKey] ?? null;
}

function compareNullableNumbers(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
