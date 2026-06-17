import { normalizeFundFamilyKey } from "./fundFamily";

export interface StockConcentrationFundMeta {
  trackingTargetCode?: string | null;
  parentFundCode?: string | null;
  fundName: string;
}

export interface DedupeStockConcentrationOptions {
  /** Max rows kept per index tracking target after collapsing share classes. */
  maxPerTrackingTarget?: number;
}

export interface StockConcentrationRowForDedup {
  fundCode: string;
  navPercent: number;
}

export function dedupeStockConcentrationRows<T extends StockConcentrationRowForDedup>(
  rows: T[],
  metaByFundCode: Map<string, StockConcentrationFundMeta>,
  options: DedupeStockConcentrationOptions = {}
): T[] {
  const maxPerTarget = options.maxPerTrackingTarget ?? 2;
  const nonIndex: T[] = [];
  const indexByTarget = new Map<string, T[]>();

  for (const row of rows) {
    const target = metaByFundCode.get(row.fundCode)?.trackingTargetCode?.trim();
    if (!target) {
      nonIndex.push(row);
      continue;
    }
    const bucket = indexByTarget.get(target) ?? [];
    bucket.push(row);
    indexByTarget.set(target, bucket);
  }

  const indexRepresentatives = [...indexByTarget.values()].flatMap((group) =>
    pickIndexRepresentatives(group, metaByFundCode, maxPerTarget)
  );

  return [...nonIndex, ...indexRepresentatives].sort((a, b) => b.navPercent - a.navPercent);
}

function pickIndexRepresentatives<T extends StockConcentrationRowForDedup>(
  rows: T[],
  metaByFundCode: Map<string, StockConcentrationFundMeta>,
  maxPerTarget: number
): T[] {
  const byFamily = new Map<string, T>();
  for (const row of rows) {
    const meta = metaByFundCode.get(row.fundCode);
    const familyKey = meta?.parentFundCode ?? (meta ? normalizeFundFamilyKey(meta.fundName) : row.fundCode);
    const existing = byFamily.get(familyKey);
    if (!existing || row.navPercent > existing.navPercent) {
      byFamily.set(familyKey, row);
    }
  }

  return [...byFamily.values()]
    .sort((a, b) => b.navPercent - a.navPercent)
    .slice(0, maxPerTarget);
}
