import type { Fund } from "../domain/types";
import { CATALOG_FUNDS } from "../domain/fundCatalog";
import { INDEX_TARGETS } from "../domain/targets";
import { fetchFundProfile, profileMatchesIndex } from "../providers/eastmoneyFundProfile";
import { mapConcurrent } from "../providers/requestUtils";

export interface TrackingAuditRow {
  code: string;
  name: string;
  targetCode: string | null;
  trackingIndex: string | null;
  benchmark: string | null;
  /** true = confirmed match, false = mismatch, null = could not verify (network/missing). */
  ok: boolean | null;
}

export interface TrackingAuditResult {
  rows: TrackingAuditRow[];
  mismatches: TrackingAuditRow[];
  unverified: TrackingAuditRow[];
}

/**
 * Precisely confirm each curated fund actually tracks its assigned index by reading the
 * authoritative 跟踪标的 / 业绩比较基准 from East Money F10, instead of trusting display names.
 */
export async function runTrackingIndexAudit(
  fetchImpl: typeof fetch = fetch,
  funds: Fund[] = CATALOG_FUNDS,
  concurrency = 5
): Promise<TrackingAuditResult> {
  const aliasByTarget = new Map(INDEX_TARGETS.map((target) => [target.code, [target.name, ...target.aliases]]));

  const rows = await mapConcurrent(funds, concurrency, async (fund): Promise<TrackingAuditRow> => {
    const aliases = aliasByTarget.get(fund.trackingTargetCode ?? "") ?? [];
    const profile = await fetchFundProfile(fetchImpl, fund.code);
    const ok = profile && (profile.trackingIndex || profile.benchmark)
      ? profileMatchesIndex(profile, aliases)
      : null;
    return {
      code: fund.code,
      name: fund.name,
      targetCode: fund.trackingTargetCode ?? null,
      trackingIndex: profile?.trackingIndex ?? null,
      benchmark: profile?.benchmark ?? null,
      ok
    };
  });

  return {
    rows,
    mismatches: rows.filter((row) => row.ok === false),
    unverified: rows.filter((row) => row.ok === null)
  };
}
