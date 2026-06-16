import { CATALOG_FUNDS, INDEX_TARGET_ANCHOR_SEEDS } from "./fundCatalog";
import type { Fund, Target } from "./types";

export const INDEX_TARGETS: Target[] = [
  { code: "NASDAQ_100", name: "纳斯达克100", type: "index", aliases: ["nasdaq100", "纳指100", "纳斯达克 100"], region: "US", displayOrder: 1 },
  { code: "SP_500", name: "标普500", type: "index", aliases: ["s&p500", "sp500", "标普 500"], region: "US", displayOrder: 2 },
  { code: "NIKKEI_225", name: "日经225", type: "index", aliases: ["nikkei225", "日经 225", "日经225"], region: "JP", displayOrder: 3 },
  { code: "HSTECH", name: "恒生科技", type: "index", aliases: ["hang seng tech", "恒科"], region: "HK", displayOrder: 4 }
];

/** Anchor codes that bias fundcode search; discovery owns completeness. */
export const INDEX_TARGET_FUND_SEEDS: Partial<Record<string, string[]>> = INDEX_TARGET_ANCHOR_SEEDS;

/** Structural catalog funds merged after discovery (I/F direct shares, LOF parents). */
export const INDEX_TARGET_FUND_SEED_FUNDS: Fund[] = CATALOG_FUNDS;

export const STOCK_TARGETS: Target[] = [
  { code: "NVDA", name: "英伟达", type: "stock", aliases: ["nvidia", "英伟达"], region: "US", displayOrder: 101 },
  { code: "AAPL", name: "苹果", type: "stock", aliases: ["apple", "苹果"], region: "US", displayOrder: 102 },
  { code: "MSFT", name: "微软", type: "stock", aliases: ["microsoft", "微软"], region: "US", displayOrder: 103 },
  { code: "TSLA", name: "特斯拉", type: "stock", aliases: ["tesla", "特斯拉"], region: "US", displayOrder: 104 },
  { code: "META", name: "Meta", type: "stock", aliases: ["facebook", "meta"], region: "US", displayOrder: 105 }
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
