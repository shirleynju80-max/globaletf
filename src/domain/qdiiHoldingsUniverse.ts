import type { Fund, ShareClass } from "./types";
import { inferShareClass, isForeignCurrencyShare, type FundSearchRow } from "../providers/eastmoneyFundSearch";

export function resolveHoldingsScanShareClass(row: FundSearchRow): ShareClass | undefined {
  let shareClass = inferShareClass(row);
  const normalizedName = row.name.replace(/[（）]/g, (char) => (char === "（" ? "(" : ")"));
  if (shareClass === "I" && /\(QDII\)$/.test(normalizedName)) {
    shareClass = "UNKNOWN";
  }
  if (shareClass === "ETF" || shareClass === "LOF" || shareClass === "A" || shareClass === "C" || shareClass === "F") {
    return shareClass;
  }
  const haystack = `${row.type} ${row.name}`;
  if (shareClass === "UNKNOWN" && /QDII/.test(haystack)) {
    return "A";
  }
  return undefined;
}

export function isQdiiHoldingsScanRow(row: FundSearchRow): boolean {
  if (isForeignCurrencyShare(row.name)) return false;
  const haystack = `${row.type} ${row.name}`;
  if (!/QDII|海外|指数型-海外/.test(haystack)) return false;
  return resolveHoldingsScanShareClass(row) != null;
}

export function toQdiiHoldingsScanFund(row: FundSearchRow): Fund | undefined {
  const shareClass = resolveHoldingsScanShareClass(row);
  if (!shareClass) return undefined;
  return {
    code: row.code,
    name: row.name,
    fundType: row.type,
    fundCompany: row.fundCompany,
    venue: shareClass === "ETF" || shareClass === "LOF" ? "on_exchange" : "off_exchange",
    trackingTargetCode: undefined,
    shareClass,
    enabled: false,
    discoverySource: "qdii-holdings-scan"
  };
}

/** Full QDII catalog used only for F10 holdings pulls (not all are enabled in the product UI). */
export function selectQdiiFundsForHoldingsScan(rows: FundSearchRow[]): Fund[] {
  const deduped = new Map<string, Fund>();
  for (const row of rows) {
    if (!isQdiiHoldingsScanRow(row)) continue;
    const fund = toQdiiHoldingsScanFund(row);
    if (!fund) continue;
    deduped.set(fund.code, fund);
  }
  return [...deduped.values()].sort((a, b) => a.code.localeCompare(b.code));
}
