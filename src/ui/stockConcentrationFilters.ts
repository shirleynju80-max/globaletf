import type { StockConcentrationRow } from "../db/repositories";

export type StockConcentrationFilterKey = "purchasable" | "on_exchange" | "off_exchange";

export function isStockRowPurchasable(row: StockConcentrationRow): boolean {
  if (row.purchaseStatus === "suspended") return false;
  if (row.purchaseStatus === "open" || row.purchaseStatus === "limited") return true;
  if (row.venue === "on_exchange" && row.shareClass === "ETF") return true;
  return false;
}

export function matchesStockConcentrationFilters(
  row: StockConcentrationRow,
  filters: StockConcentrationFilterKey[]
): boolean {
  if (filters.length === 0) return true;

  const wantsOnExchange = filters.includes("on_exchange");
  const wantsOffExchange = filters.includes("off_exchange");
  const wantsPurchasable = filters.includes("purchasable");

  if (wantsOnExchange || wantsOffExchange) {
    const venueMatch =
      (wantsOnExchange && row.venue === "on_exchange")
      || (wantsOffExchange && row.venue === "off_exchange");
    if (!venueMatch) return false;
  }

  if (wantsPurchasable && !isStockRowPurchasable(row)) return false;

  return true;
}

export function toggleStockConcentrationFilter(
  filters: StockConcentrationFilterKey[],
  key: StockConcentrationFilterKey
): StockConcentrationFilterKey[] {
  return filters.includes(key) ? filters.filter((item) => item !== key) : [...filters, key];
}
