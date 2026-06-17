import { CATALOG_FUNDS, INDEX_TARGET_ANCHOR_SEEDS } from "./fundCatalog";
import type { Fund, Target } from "./types";

export const INDEX_TARGETS: Target[] = [
  { code: "NASDAQ_100", name: "纳斯达克100", type: "index", aliases: ["nasdaq100", "纳指100", "纳斯达克 100"], region: "US", displayOrder: 1 },
  { code: "SP_500", name: "标普500", type: "index", aliases: ["s&p500", "sp500", "标普 500"], region: "US", displayOrder: 2 },
  { code: "NIKKEI_225", name: "日经225", type: "index", aliases: ["nikkei225", "日经 225", "日经225"], region: "JP", displayOrder: 3 },
  { code: "HSTECH", name: "恒生科技", type: "index", aliases: ["hang seng tech", "恒科"], region: "HK", displayOrder: 4 },
  { code: "KOSPI", name: "韩国综合指数", type: "index", aliases: ["kospi", "韩国综合股价指数", "韩综指", "韩国综合"], region: "KR", displayOrder: 5 }
];

/** Anchor codes that bias fundcode search; discovery owns completeness. */
export const INDEX_TARGET_FUND_SEEDS: Partial<Record<string, string[]>> = INDEX_TARGET_ANCHOR_SEEDS;

/** Structural catalog funds merged after discovery (I/F direct shares, LOF parents). */
export const INDEX_TARGET_FUND_SEED_FUNDS: Fund[] = CATALOG_FUNDS;

export const STOCK_TARGETS: Target[] = [
  { code: "NVDA", name: "英伟达", type: "stock", aliases: ["nvidia", "英伟达"], region: "US", displayOrder: 101 },
  { code: "AAPL", name: "苹果", type: "stock", aliases: ["apple", "苹果"], region: "US", displayOrder: 102 },
  { code: "GOOG", name: "谷歌", type: "stock", aliases: ["google", "alphabet", "googl", "谷歌"], region: "US", displayOrder: 103 },
  { code: "MU", name: "美光", type: "stock", aliases: ["micron", "美光"], region: "US", displayOrder: 104 },
  { code: "AVGO", name: "博通", type: "stock", aliases: ["broadcom", "博通"], region: "US", displayOrder: 105 },
  { code: "AMD", name: "AMD", type: "stock", aliases: ["amd", "超威"], region: "US", displayOrder: 106 },
  { code: "TSM", name: "台积电", type: "stock", aliases: ["tsmc", "台积电", "台湾积体电路"], region: "TW", displayOrder: 107 },
  { code: "HYNIX", name: "海力士", type: "stock", aliases: ["hynix", "sk hynix", "sk海力士", "海力士"], region: "KR", displayOrder: 108 }
];

export const TARGETS = [...INDEX_TARGETS, ...STOCK_TARGETS].sort((a, b) => a.displayOrder - b.displayOrder);

export function findTargetByCode(input: string): Target | undefined {
  const normalized = normalizeTargetLookup(input);
  return TARGETS.find((target) => {
    if (normalizeTargetLookup(target.code) === normalized) return true;
    return target.aliases.some((alias) => normalizeTargetLookup(alias) === normalized);
  });
}

function normalizeTargetLookup(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "");
}
