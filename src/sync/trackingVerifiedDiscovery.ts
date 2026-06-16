import { isOnExchangeTradableCode, type DiscoverySource } from "../domain/fundDiscovery";
import type { Fund } from "../domain/types";
import { INDEX_TARGETS } from "../domain/targets";
import { fetchFundProfile, profileMatchesIndex } from "../providers/eastmoneyFundProfile";
import { inferShareClass, selectFundsForTargets, type FundSearchRow, type TargetSelection } from "../providers/eastmoneyFundSearch";
import { mapConcurrent } from "../providers/requestUtils";

interface ProfileDiscoveryOptions {
  fetchImpl?: typeof fetch;
  concurrency?: number;
  requestTimeoutMs?: number;
}

function inferVenueFromRow(row: FundSearchRow): Fund["venue"] {
  const shareClass = inferShareClass(row);
  if (shareClass === "ETF" || shareClass === "LOF") return "on_exchange";
  if (isOnExchangeTradableCode(row.code) && (row.code.startsWith("15") || row.code.startsWith("51"))) return "on_exchange";
  return "off_exchange";
}

function inferShareClassFromRow(row: FundSearchRow): Fund["shareClass"] {
  const shareClass = inferShareClass(row);
  if (shareClass !== "UNKNOWN") return shareClass;
  if (/^\d{6}$/.test(row.code) && (row.code.startsWith("15") || row.code.startsWith("51"))) return "ETF";
  if (row.code.startsWith("16")) return "LOF";
  return "ETF";
}

function isOnExchangeProfileCandidate(row: FundSearchRow): boolean {
  return isOnExchangeTradableCode(row.code) || inferShareClass(row) === "ETF" || inferShareClass(row) === "LOF";
}

function isOffExchangeFundRow(row: FundSearchRow): boolean {
  const shareClass = inferShareClass(row);
  if (shareClass === "ETF" || shareClass === "LOF") return false;
  if (isOnExchangeTradableCode(row.code) && (row.code.startsWith("15") || row.code.startsWith("51") || row.code.startsWith("16"))) {
    return false;
  }
  return shareClass !== "UNKNOWN";
}

function isIndexLikeFundRow(row: FundSearchRow): boolean {
  const haystack = `${row.type} ${row.name}`;
  return /QDII|指数|ETF联接|发起|指数型|海外股票/.test(haystack);
}

function rowByCode(rows: FundSearchRow[]): Map<string, FundSearchRow> {
  const byCode = new Map<string, FundSearchRow>();
  for (const row of rows) {
    if (!byCode.has(row.code)) byCode.set(row.code, row);
  }
  return byCode;
}

async function verifyTrackingProfileForRows(
  candidateRows: FundSearchRow[],
  targets: TargetSelection[],
  options: ProfileDiscoveryOptions
): Promise<Fund[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const concurrency = options.concurrency ?? 8;
  const timeoutMs = options.requestTimeoutMs ?? 10_000;
  const aliasByTarget = new Map(INDEX_TARGETS.map((target) => [target.code, [target.name, ...target.aliases]]));

  const discovered = await mapConcurrent(candidateRows, concurrency, async (row): Promise<Fund | null> => {
    const profile = await fetchFundProfile(fetchImpl, row.code, timeoutMs);
    if (!profile) return null;

    const matchedTarget = targets.find((target) => {
      const aliases = aliasByTarget.get(target.targetCode) ?? [];
      return profileMatchesIndex(profile, aliases);
    });
    if (!matchedTarget) return null;

    const shareClass = inferShareClassFromRow(row);
    const venue = inferVenueFromRow(row);
    return {
      code: row.code,
      name: row.name,
      fundType: row.type || "指数型-海外股票",
      fundCompany: row.fundCompany,
      venue,
      trackingTargetCode: matchedTarget.targetCode,
      shareClass,
      enabled: true,
      discoverySource: "tracking-profile" satisfies DiscoverySource
    };
  });

  return discovered.filter((fund): fund is Fund => fund != null);
}

export async function discoverOnExchangeFundsByTrackingProfile(
  screenerRows: FundSearchRow[],
  targets: TargetSelection[],
  existingCodes: Set<string>,
  options: ProfileDiscoveryOptions = {},
  fundCodeRows: FundSearchRow[] = []
): Promise<Fund[]> {
  const lookup = rowByCode([...screenerRows, ...fundCodeRows]);
  const matchedCodes = new Set([
    ...selectFundsForTargets(screenerRows, targets).map((fund) => fund.code),
    ...selectFundsForTargets(fundCodeRows, targets)
      .filter((fund) => fund.venue === "on_exchange")
      .map((fund) => fund.code)
  ]);

  const candidates = [...matchedCodes]
    .filter((code) => !existingCodes.has(code))
    .map((code) => lookup.get(code))
    .filter((row): row is FundSearchRow => row != null && isOnExchangeProfileCandidate(row));

  return verifyTrackingProfileForRows(candidates, targets, options);
}

export async function discoverOffExchangeFundsByTrackingProfile(
  fundCodeRows: FundSearchRow[],
  targets: TargetSelection[],
  existingCodes: Set<string>,
  options: ProfileDiscoveryOptions = {}
): Promise<Fund[]> {
  const matchedCodes = new Set(
    selectFundsForTargets(fundCodeRows, targets)
      .filter((fund) => fund.venue === "off_exchange")
      .map((fund) => fund.code)
  );
  const lookup = rowByCode(fundCodeRows);
  const candidates = [...matchedCodes]
    .filter((code) => !existingCodes.has(code))
    .map((code) => lookup.get(code))
    .filter((row): row is FundSearchRow => row != null && isOffExchangeFundRow(row) && isIndexLikeFundRow(row));

  return verifyTrackingProfileForRows(candidates, targets, options);
}

/** @deprecated Use discoverOnExchangeFundsByTrackingProfile or discoverOffExchangeFundsByTrackingProfile. */
export async function discoverFundsByTrackingProfile(
  rows: FundSearchRow[],
  targets: TargetSelection[],
  existingCodes: Set<string>,
  options: ProfileDiscoveryOptions,
  rowFilter: (row: FundSearchRow) => boolean
): Promise<Fund[]> {
  const candidates = rows.filter((row) => !existingCodes.has(row.code) && rowFilter(row) && isIndexLikeFundRow(row));
  return verifyTrackingProfileForRows(candidates, targets, options);
}
