import type Database from "better-sqlite3";
import { CATALOG_FUNDS } from "../domain/fundCatalog";
import { isExcludedIndexDiscoveryName } from "../domain/fundDiscovery";
import { INDEX_TARGETS } from "../domain/targets";
import type { Fund } from "../domain/types";
import { fetchFundProfile, profileMatchesIndex } from "../providers/eastmoneyFundProfile";
import { mapConcurrent } from "../providers/requestUtils";

export interface FundTrackingProfileRow {
  fundCode: string;
  trackingIndex: string | null;
  benchmark: string | null;
  verifiedOk: boolean;
  verifiedAt: string;
}

export async function syncFundTrackingProfiles(
  db: Database.Database,
  funds: Fund[] = CATALOG_FUNDS,
  fetchImpl: typeof fetch = fetch,
  concurrency = 5
): Promise<FundTrackingProfileRow[]> {
  const aliasByTarget = new Map(INDEX_TARGETS.map((target) => [target.code, [target.name, ...target.aliases]]));
  const targets = funds.filter((fund) => fund.enabled && fund.trackingTargetCode);

  const rows = await mapConcurrent(targets, concurrency, async (fund): Promise<FundTrackingProfileRow | null> => {
    const aliases = aliasByTarget.get(fund.trackingTargetCode ?? "") ?? [];
    const profile = await fetchFundProfile(fetchImpl, fund.code);
    if (!profile?.trackingIndex && !profile?.benchmark) return null;
    return {
      fundCode: fund.code,
      trackingIndex: profile.trackingIndex,
      benchmark: profile.benchmark,
      verifiedOk: profileMatchesIndex(profile, aliases),
      verifiedAt: new Date().toISOString()
    };
  });

  const verifiedRows = rows.filter((row): row is FundTrackingProfileRow => row != null);
  upsertFundTrackingProfiles(db, verifiedRows);
  return verifiedRows;
}

export function upsertFundTrackingProfiles(db: Database.Database, rows: FundTrackingProfileRow[]): void {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO fund_tracking_profiles (
      fund_code, tracking_index, benchmark, verified_ok, verified_at
    ) VALUES (
      @fundCode, @trackingIndex, @benchmark, @verifiedOk, @verifiedAt
    )
  `);
  const tx = db.transaction(() => {
    for (const row of rows) {
      insert.run({ ...row, verifiedOk: row.verifiedOk ? 1 : 0 });
    }
  });
  tx();
}

/** Upgrade discovery tags for funds whose F10 tracking index was verified during sync. */
export function applyProfileDiscoverySources(funds: Fund[], profiles: FundTrackingProfileRow[]): Fund[] {
  const verified = new Set(profiles.filter((row) => row.verifiedOk).map((row) => row.fundCode));
  return funds.map((fund) => {
    if (!verified.has(fund.code)) return fund;
    return { ...fund, discoverySource: "tracking-profile" };
  });
}

/** Drop index-tagged funds whose display name is a known non-index theme (e.g. 汽车产业升级). */
export function disableExcludedDiscoveryNames(funds: Fund[]): Fund[] {
  return funds.map((fund) => {
    if (!fund.trackingTargetCode || !isExcludedIndexDiscoveryName(fund.name, fund.trackingTargetCode)) {
      return fund;
    }
    return { ...fund, enabled: false, trackingTargetCode: undefined };
  });
}

/** Drop index-tagged funds whose F10 tracking index / benchmark failed verification. */
export function disableProfileMismatchedFunds(funds: Fund[], profiles: FundTrackingProfileRow[]): Fund[] {
  const mismatches = new Set(profiles.filter((row) => !row.verifiedOk).map((row) => row.fundCode));
  return funds.map((fund) => {
    if (!fund.trackingTargetCode || !mismatches.has(fund.code)) return fund;
    return { ...fund, enabled: false, trackingTargetCode: undefined };
  });
}

export function applyIndexFundVerificationGate(funds: Fund[], profiles: FundTrackingProfileRow[]): Fund[] {
  return disableExcludedDiscoveryNames(disableProfileMismatchedFunds(applyProfileDiscoverySources(funds, profiles), profiles));
}

export function queryFundTrackingProfileMismatches(db: Database.Database, fundCodes: string[]): string[] {
  if (fundCodes.length === 0) return [];
  const placeholders = fundCodes.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT fund_code AS fundCode, verified_ok AS verifiedOk, tracking_index AS trackingIndex
    FROM fund_tracking_profiles
    WHERE fund_code IN (${placeholders})
  `).all(...fundCodes) as Array<{ fundCode: string; verifiedOk: number; trackingIndex: string | null }>;
  const byCode = new Map(rows.map((row) => [row.fundCode, row]));
  return fundCodes.filter((code) => {
    const row = byCode.get(code);
    if (!row?.trackingIndex) return true;
    return row.verifiedOk !== 1;
  });
}
