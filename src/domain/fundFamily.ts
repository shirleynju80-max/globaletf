import type { DiscoverySource } from "./fundDiscovery";
import type { Fund } from "./types";
import { inferShareClass, type FundSearchRow, type TargetSelection } from "../providers/eastmoneyFundSearch";

const SHARE_CLASS_SUFFIX = /[（(]?(?:A|C|F|I|E|Y|D|O)(?:人民币|美元现汇|美元现钞)?[）)]?$/i;

/** Strip share-class suffix so A/C/F/I variants of the same product share a family key. */
export function normalizeFundFamilyKey(name: string): string {
  return name
    .replace(/[（）]/g, (char) => (char === "（" ? "(" : ")"))
    .replace(SHARE_CLASS_SUFFIX, "")
    .replace(/\s+/g, "")
    .replace(/[()]/g, "");
}

export function groupFundSearchRowsByFamily(rows: FundSearchRow[]): Map<string, FundSearchRow[]> {
  const grouped = new Map<string, FundSearchRow[]>();
  for (const row of rows) {
    const key = normalizeFundFamilyKey(row.name);
    if (!key) continue;
    const bucket = grouped.get(key) ?? [];
    bucket.push(row);
    grouped.set(key, bucket);
  }
  return grouped;
}

function rowToFund(row: FundSearchRow, targetCode: string): Fund | null {
  const shareClass = inferShareClass(row);
  if (shareClass === "UNKNOWN") return null;
  return {
    code: row.code,
    name: row.name,
    fundType: row.type,
    fundCompany: row.fundCompany,
    venue: shareClass === "ETF" || shareClass === "LOF" ? "on_exchange" : "off_exchange",
    trackingTargetCode: targetCode,
    shareClass,
    enabled: true
  };
}

/**
 * When any share class of a fund family is discovered for a target, pull in sibling
 * share classes (A/C/F/I/…) present in the fund-code universe without another F10 round-trip.
 */
export function expandFundFamilyShareClasses(
  discovered: Fund[],
  allRows: FundSearchRow[],
  _targets: TargetSelection[]
): Fund[] {
  const byCode = new Map(discovered.map((fund) => [fund.code, fund]));
  const targetByFamily = new Map<string, string>();
  for (const fund of discovered) {
    if (!fund.trackingTargetCode) continue;
    targetByFamily.set(normalizeFundFamilyKey(fund.name), fund.trackingTargetCode);
  }

  const grouped = groupFundSearchRowsByFamily(allRows);
  const additions: Fund[] = [];
  for (const [familyKey, targetCode] of targetByFamily) {
    for (const row of grouped.get(familyKey) ?? []) {
      if (byCode.has(row.code)) continue;
      const fund = rowToFund(row, targetCode);
      if (!fund) continue;
      additions.push({
        ...fund,
        discoverySource: "fund-family" satisfies DiscoverySource
      });
      byCode.set(fund.code, fund);
    }
  }
  return additions;
}

/** Link off-exchange feeders to an on-exchange ETF parent when company + target match. */
export function linkFeederParentEtfs(funds: Fund[]): Fund[] {
  const etfs = funds.filter((fund) => fund.venue === "on_exchange" && fund.trackingTargetCode);
  const etfByTargetCompany = new Map<string, Fund>();
  for (const etf of etfs) {
    if (!etf.fundCompany || !etf.trackingTargetCode) continue;
    etfByTargetCompany.set(`${etf.trackingTargetCode}:${etf.fundCompany}`, etf);
  }

  return funds.map((fund) => {
    if (fund.venue !== "off_exchange" || fund.parentFundCode || !fund.fundCompany || !fund.trackingTargetCode) {
      return fund;
    }
    const parent = etfByTargetCompany.get(`${fund.trackingTargetCode}:${fund.fundCompany}`);
    return parent ? { ...fund, parentFundCode: parent.code } : fund;
  });
}
