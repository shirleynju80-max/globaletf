import { directChannelForCompany, TARGET_DIRECT_CHANNELS, type DirectChannelId } from "../../domain/channels";
import { defaultChannelScopeForShareClass } from "../../domain/purchaseLimits";
import type { Fund, PurchaseLimit } from "../../domain/types";
import { createEastMoneyF10OffExchangeProvider, type OffExchangeFeeLimitSnapshot } from "../eastmoneyF10";
export { createEastMoneyF10OffExchangeProvider, type OffExchangeFeeLimitSnapshot };
import { mapConcurrent } from "../requestUtils";
import type { DataProvider } from "../types";
import { fetchDirectLimitFromAnnouncements } from "./announcements";
import {
  fetchBoseraDirectLimits,
  fetchDachengDirectLimits,
  fetchGuangfaDirectLimits,
  fetchGuotaiDirectLimits,
  fetchHarvestDirectLimits,
  fetchHuaanDirectLimits,
  fetchHuataiPbDirectLimits,
  fetchSouthernDirectLimits
} from "./companyPages";

const SOURCE = "fundco-direct-limits";
const DEFAULT_TIMEOUT_MS = 10_000;

interface ProviderOptions {
  fetchImpl?: typeof fetch;
  dataDate?: string;
  syncRunId?: string;
  concurrency?: number;
  requestTimeoutMs?: number;
}

type DirectFetcher = (
  fetchImpl: typeof fetch,
  funds: Fund[],
  dataDate: string,
  syncRunId: string,
  timeoutMs: number
) => Promise<PurchaseLimit[]>;

const DIRECT_FETCHERS: Record<DirectChannelId, DirectFetcher | null> = {
  nfjj: fetchSouthernDirectLimits,
  bosera: fetchBoseraDirectLimits,
  js: fetchHarvestDirectLimits,
  htbr: fetchHuataiPbDirectLimits,
  gf: fetchGuangfaDirectLimits,
  huaan: fetchHuaanDirectLimits,
  dc: fetchDachengDirectLimits,
  nf: fetchGuotaiDirectLimits,
  direct_aggregate: null
};

export function isDirectShareFund(fund: Fund): boolean {
  return fund.enabled
    && fund.venue === "off_exchange"
    && defaultChannelScopeForShareClass(fund.shareClass) === "direct";
}

export function mergeDirectLimits(rows: PurchaseLimit[]): PurchaseLimit[] {
  const byKey = new Map<string, PurchaseLimit>();
  for (const row of rows) {
    const key = `${row.fundCode}:${row.shareClass}:${row.channelId}`;
    const existing = byKey.get(key);
    if (!existing || compareDirectLimitRows(row, existing) > 0) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()];
}

function compareDirectLimitRows(candidate: PurchaseLimit, incumbent: PurchaseLimit): number {
  const candidateKnown = candidate.status !== "unknown" ? 1 : 0;
  const incumbentKnown = incumbent.status !== "unknown" ? 1 : 0;
  if (candidateKnown !== incumbentKnown) return candidateKnown - incumbentKnown;

  const confidenceDiff = (candidate.confidence ?? 0) - (incumbent.confidence ?? 0);
  if (confidenceDiff !== 0) return confidenceDiff;

  const candidateAmount = hasLimitAmount(candidate) ? 1 : 0;
  const incumbentAmount = hasLimitAmount(incumbent) ? 1 : 0;
  return candidateAmount - incumbentAmount;
}

function hasLimitAmount(row: PurchaseLimit): boolean {
  return row.limitAmount != null || row.limitAmountYuan != null;
}

export async function fetchDirectChannelLimits(
  fetchImpl: typeof fetch,
  funds: Fund[],
  dataDate: string,
  syncRunId: string,
  options: { concurrency?: number; requestTimeoutMs?: number } = {}
): Promise<PurchaseLimit[]> {
  const directFunds = funds.filter(isDirectShareFund);
  if (directFunds.length === 0) return [];

  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const concurrency = options.concurrency ?? 4;
  const grouped = groupFundsByDirectChannel(directFunds);
  const companyLimits = (
    await Promise.all(
      [...grouped.entries()].flatMap(([channelId, channelFunds]) => {
        const fetcher = DIRECT_FETCHERS[channelId];
        return fetcher ? [fetcher(fetchImpl, channelFunds, dataDate, syncRunId, timeoutMs)] : [];
      })
    )
  ).flat();

  const announcementLimits = (
    await mapConcurrent(directFunds, concurrency, (fund) =>
      fetchDirectLimitFromAnnouncements(fetchImpl, fund, dataDate, syncRunId, timeoutMs)
    )
  ).filter((row): row is PurchaseLimit => row != null);

  return mergeDirectLimits([...companyLimits, ...announcementLimits]);
}

export function createDirectChannelLimitProvider(funds: Fund[], options: ProviderOptions = {}): DataProvider<PurchaseLimit[]> {
  return {
    name: SOURCE,
    fetch: async () => {
      const fetchImpl = options.fetchImpl ?? fetch;
      const dataDate = options.dataDate ?? new Date().toISOString().slice(0, 10);
      const syncRunId = options.syncRunId ?? `fundco-direct-${dataDate}`;
      const limits = await fetchDirectChannelLimits(fetchImpl, funds, dataDate, syncRunId, {
        concurrency: options.concurrency,
        requestTimeoutMs: options.requestTimeoutMs
      });
      if (limits.length === 0) {
        return { ok: false, errorCategory: "missing_fields", message: "No direct-channel purchase limits fetched" };
      }
      return { ok: true, data: limits, source: SOURCE, dataDate, confidence: 0.88 };
    }
  };
}

export function createMergedOffExchangeProvider(
  funds: Fund[],
  options: ProviderOptions & { baseProvider?: DataProvider<OffExchangeFeeLimitSnapshot> } = {}
): DataProvider<OffExchangeFeeLimitSnapshot> {
  const baseProvider = options.baseProvider ?? createEastMoneyF10OffExchangeProvider(funds, options);
  const directProvider = createDirectChannelLimitProvider(funds, options);
  return {
    name: "offexchange-merged",
    fetch: async () => {
      const baseResult = await baseProvider.fetch();
      const directResult = await directProvider.fetch();
      if (!baseResult.ok && !directResult.ok) return baseResult;

      const base = baseResult.ok ? baseResult.data : { limits: [], fees: [] };
      const directLimits = directResult.ok ? directResult.data : [];
      const dataDate = baseResult.ok ? baseResult.dataDate : directResult.ok ? directResult.dataDate : new Date().toISOString().slice(0, 10);
      const source = [
        baseResult.ok ? baseResult.source : null,
        directResult.ok ? directResult.source : null
      ].filter(Boolean).join("+") || "offexchange-merged";

      return {
        ok: true,
        data: {
          limits: [...base.limits, ...mergeDirectLimits(directLimits)],
          fees: base.fees
        },
        source,
        dataDate,
        confidence: Math.max(baseResult.ok ? baseResult.confidence : 0, directResult.ok ? directResult.confidence : 0)
      };
    }
  };
}

function groupFundsByDirectChannel(funds: Fund[]): Map<DirectChannelId, Fund[]> {
  const grouped = new Map<DirectChannelId, Fund[]>();
  for (const channelId of TARGET_DIRECT_CHANNELS) grouped.set(channelId, []);
  for (const fund of funds) {
    const channelId = directChannelForCompany(fund.fundCompany);
    grouped.get(channelId)?.push(fund);
  }
  return grouped;
}
