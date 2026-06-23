import type { Fund } from "./types";

export type DiscoverySource =
  | "catalog-seed"
  | "fundcode-search"
  | "agency-channel"
  | "screener-name"
  | "tracking-profile"
  | "fund-family"
  | "stock-scan"
  | "qdii-holdings-scan";

/** On-exchange tradable fund codes (ETF / cross-listed LOF). */
export function isOnExchangeTradableCode(code: string): boolean {
  return /^\d{6}$/.test(code) && (code.startsWith("15") || code.startsWith("51") || code.startsWith("16"));
}

/**
 * Loose name hints used to narrow F10 profile lookups on the full ETF screener universe.
 * Profile verification is authoritative; hints only reduce HTTP volume.
 */
export const INDEX_DISCOVERY_NAME_HINTS: Record<string, RegExp[]> = {
  NASDAQ_100: [/纳斯达克\s*100/, /纳指\s*100/, /NASDAQ\s*100/i, /NSDK100/i, /QQQ/i, /^纳指ETF/, /^纳斯达克ETF/],
  SP_500: [/标普\s*500/, /标普500/, /S&P\s*500/i, /SP\s*500/i, /BP500/i],
  NIKKEI_225: [/日经/, /NIKKEI/i, /225/, /日经225/, /225ETF/i, /日経/, /NI225/i],
  HSTECH: [/恒生科技/, /恒科/, /HSTECH/i, /恒生指数科技/],
  KOSPI: [/韩国综合/, /KOSPI/i, /韩国综合股价/, /韩综指/, /韩国.*综合.*指数/]
};

export function isExcludedIndexDiscoveryName(name: string, targetCode: string): boolean {
  if (targetCode === "NASDAQ_100" && /科技|生物|汽车|油气|石油|消费|价值|质量|低波/.test(name)) return true;
  if (targetCode === "KOSPI" && /半导体|中韩半导体|中韩芯片|芯片ETF|931790/i.test(name)) return true;
  return false;
}

export function matchesDiscoveryNameHint(name: string, targetCode: string): boolean {
  if (isExcludedIndexDiscoveryName(name, targetCode)) return false;
  const hints = INDEX_DISCOVERY_NAME_HINTS[targetCode] ?? [];
  return hints.some((pattern) => pattern.test(name));
}

export function isDiscoveryBackedFund(fund: Fund): boolean {
  return Boolean(fund.discoverySource);
}

export function discoverySourceRank(source: DiscoverySource | undefined): number {
  switch (source) {
    case "tracking-profile": return 5;
    case "fund-family": return 4;
    case "screener-name": return 4;
    case "agency-channel": return 3;
    case "fundcode-search": return 2;
    case "catalog-seed": return 1;
    default: return 0;
  }
}

export function preferDiscoverySource(
  left: DiscoverySource | undefined,
  right: DiscoverySource | undefined
): DiscoverySource | undefined {
  return discoverySourceRank(right) > discoverySourceRank(left) ? right : left;
}

const DISCOVERY_SOURCE_LABELS: Record<DiscoverySource, string> = {
  "tracking-profile": "F10校验",
  "fund-family": "同系列产品",
  "screener-name": "ETF筛选",
  "agency-channel": "代销搜索",
  "fundcode-search": "代码库",
  "catalog-seed": "结构种子",
  "stock-scan": "持仓扫描",
  "qdii-holdings-scan": "季报持仓扫描"
};

export function formatDiscoverySourceLabel(source: string | null | undefined): string {
  if (!source) return "-";
  return DISCOVERY_SOURCE_LABELS[source as DiscoverySource] ?? source;
}

export function isStrongDiscoverySource(source: string | null | undefined): boolean {
  return source === "tracking-profile" || source === "screener-name" || source === "fund-family";
}
