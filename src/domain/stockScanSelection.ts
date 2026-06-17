import { INDEX_TARGETS } from "./targets";
import type { Fund, ShareClass } from "./types";
import { isOnExchangeTradableCode, matchesDiscoveryNameHint } from "./fundDiscovery";
import { inferShareClass, isForeignCurrencyShare, type FundSearchRow } from "../providers/eastmoneyFundSearch";

export const INDEX_TRACKING_TARGET_CODES = INDEX_TARGETS.map((target) => target.code);

const ACTIVE_QDII_HINT = /混合|灵活配置|灵活|股票|主题|精选|配置|新兴|科技|半导体|芯片|成长|价值|全球|美国|欧洲|亚太/;

export function isIndexTrackerSearchRow(row: FundSearchRow): boolean {
  const hintText = `${row.name} ${row.shortName} ${row.pinyin} ${row.otherName ?? ""}`;
  return INDEX_TRACKING_TARGET_CODES.some((targetCode) => matchesDiscoveryNameHint(hintText, targetCode));
}

export function isStockScanShareClass(shareClass: ShareClass): boolean {
  return shareClass === "ETF" || shareClass === "LOF" || shareClass === "A" || shareClass === "F";
}

export function resolveStockScanShareClass(row: FundSearchRow): ShareClass | undefined {
  let shareClass = inferShareClass(row);
  const normalizedName = row.name.replace(/[（）]/g, (char) => (char === "（" ? "(" : ")"));
  if (shareClass === "I" && /\(QDII\)$/.test(normalizedName)) {
    shareClass = "UNKNOWN";
  }
  if (isStockScanShareClass(shareClass)) return shareClass;
  const haystack = `${row.type} ${row.name}`;
  if (shareClass === "UNKNOWN" && /QDII/.test(haystack) && !isOnExchangeTradableCode(row.code)) {
    return "A";
  }
  return undefined;
}

export function isActiveQdiiStockScanRow(row: FundSearchRow): boolean {
  if (isForeignCurrencyShare(row.name)) return false;
  const haystack = `${row.type} ${row.name}`;
  if (!/QDII/.test(haystack)) return false;
  if (isIndexTrackerSearchRow(row)) return false;
  if (!ACTIVE_QDII_HINT.test(haystack)) return false;
  return resolveStockScanShareClass(row) != null;
}

export function toStockScanFund(row: FundSearchRow): Fund | undefined {
  const shareClass = resolveStockScanShareClass(row);
  if (!shareClass) return undefined;
  return {
    code: row.code,
    name: row.name,
    fundType: row.type,
    fundCompany: row.fundCompany,
    venue: shareClass === "ETF" || shareClass === "LOF" ? "on_exchange" : "off_exchange",
    trackingTargetCode: undefined,
    shareClass,
    enabled: true,
    discoverySource: "stock-scan"
  };
}

export function selectActiveQdiiFundsForStockScan(rows: FundSearchRow[]): Fund[] {
  const deduped = new Map<string, Fund>();
  for (const row of rows) {
    if (!isActiveQdiiStockScanRow(row)) continue;
    const fund = toStockScanFund(row);
    if (!fund) continue;
    deduped.set(fund.code, fund);
  }
  return [...deduped.values()].sort((a, b) => a.code.localeCompare(b.code));
}
