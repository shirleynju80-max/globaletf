import type Database from "better-sqlite3";
import { insertSnapshotBundle, recordFundDiscoveryManifest, recordProviderResults, recordSyncRun, recordSyncStatus, replaceDiscoveryProfileGaps, queryCachedHoldingsByFundCode, type ProviderResultRow, type SyncStatusRow } from "../db/repositories";
import { INDEX_TARGETS, INDEX_TARGET_FUND_SEED_FUNDS, INDEX_TARGET_FUND_SEEDS } from "../domain/targets";
import { isDelistedOnExchange } from "../domain/delistedOnExchange";
import type { FeeTier, Fund, FundHolding, FundQuote, PurchaseLimit } from "../domain/types";
import { STOCK_SCAN_FUNDS } from "../domain/stockScanUniverse";
import { createEastMoneyMultiTargetFundSearchProvider } from "../providers/eastmoneyFundSearch";
import { createAgencyAugmentedFundDiscoveryProvider, mergeFundsByCode } from "../providers/agencyFundDiscovery";
import { discoverStockScanFunds } from "../providers/stockHoldingFundDiscovery";
import { createEastMoneyHoldingsProvider } from "../providers/eastmoneyHoldings";
import { createEastMoneyOnExchangeQuoteProvider } from "../providers/eastmoneyOnExchangeQuotes";
import { mockFees, mockFunds, mockHoldings, mockLimits, mockQuotes } from "../providers/mockProviders";
import { createMergedOffExchangeProvider, type OffExchangeFeeLimitSnapshot } from "../providers/directChannelLimits";
import { fetchFundReferenceEstimate } from "../providers/fundReferenceEstimate";
import { fetchEastMoneyQuoteListMap, mergeQuoteListIopv } from "../providers/eastmoneyQuoteList";
import { runProviderChain } from "../providers/providerChain";
import { mapConcurrent } from "../providers/requestUtils";
import type { DataProvider, ProviderAttempt } from "../providers/types";
import { tradeDateCloseMs } from "../domain/iopvAlignment";
import { enrichQuoteWithMatchedIopv, normalizeOnExchangeQuoteSource } from "./iopvQuoteEnrichment";
import { syncFundTrackingProfiles, applyProfileDiscoverySources } from "./trackingProfileSync";
import { mergeFundsForHoldingsSync } from "./holdingsSyncUniverse";
import { finalizeStockHoldingIndex } from "./stockHoldingIndexSync";
import { loadQdiiHoldingsCatalog } from "../providers/qdiiHoldingsCatalog";

export type SyncArea = "fund" | "quote" | "offExchange" | "holding";

interface DailySyncOptions {
  useLiveProviders?: boolean;
  areas?: SyncArea[];
  fundProviders?: DataProvider<Fund[]>[];
  quoteProviders?: DataProvider<FundQuote[]>[];
  offExchangeProviders?: DataProvider<OffExchangeFeeLimitSnapshot>[];
  holdingProviders?: DataProvider<FundHolding[]>[];
  stockScanFundDiscovery?: () => Promise<Fund[]>;
  qdiiHoldingsCatalogLoader?: () => Promise<Fund[]>;
  now?: () => number;
}

interface ResolvedData<T> {
  data: T;
  isFallback: boolean;
  providerResults: ProviderAttempt[];
  status: Omit<SyncStatusRow, "area" | "updatedAt">;
  discoveryProfileGaps?: Array<{ targetCode: string; fundCode: string; venue: string }>;
}

interface ResolvedOffExchange {
  data: OffExchangeFeeLimitSnapshot;
  providerResults: ProviderAttempt[];
  limitStatus: Omit<SyncStatusRow, "area" | "updatedAt">;
  feeStatus: Omit<SyncStatusRow, "area" | "updatedAt">;
}

export async function runDailySync(db: Database.Database, options: DailySyncOptions = {}): Promise<void> {
  const areas = new Set(options.areas?.length ? options.areas : ["fund", "quote", "offExchange", "holding"]);
  const syncRunId = createDailySyncRunId();
  const startedAt = new Date().toISOString();
  const now = options.now ?? Date.now;
  const fundStartedAt = now();
  let fundSnapshot = await resolveFunds(db, options);
  const fundDurationMs = elapsedMs(now, fundStartedAt);
  if (options.useLiveProviders) {
    const profiles = await syncFundTrackingProfiles(db, fundSnapshot.data).catch(() => []);
    fundSnapshot = {
      ...fundSnapshot,
      data: applyProfileDiscoverySources(fundSnapshot.data, profiles)
    };
  }
  let quotes: ResolvedData<FundQuote[]> | undefined;
  let quoteDurationMs: number | undefined;
  if (areas.has("quote")) {
    const quoteStartedAt = now();
    quotes = await resolveQuotes(db, options, fundSnapshot);
    quoteDurationMs = elapsedMs(now, quoteStartedAt);
  }
  let offExchangeSnapshot: ResolvedOffExchange | undefined;
  let offExchangeDurationMs: number | undefined;
  if (areas.has("offExchange")) {
    const offExchangeStartedAt = now();
    offExchangeSnapshot = await resolveOffExchangeSnapshot(db, options, fundSnapshot);
    offExchangeDurationMs = elapsedMs(now, offExchangeStartedAt);
  }
  let holdings: ResolvedData<FundHolding[]> | undefined;
  let holdingDurationMs: number | undefined;
  let qdiiHoldingsCatalog: Fund[] = [];
  if (areas.has("holding") && options.useLiveProviders) {
    qdiiHoldingsCatalog = await resolveQdiiHoldingsCatalog(options);
  }
  if (areas.has("holding")) {
    const holdingStartedAt = now();
    holdings = await resolveHoldings(db, options, fundSnapshot, qdiiHoldingsCatalog);
    holdingDurationMs = elapsedMs(now, holdingStartedAt);
  }

  const updatedAt = new Date().toISOString();
  insertSnapshotBundle(db, {
    syncRunId,
    funds: fundSnapshot.data,
    quotes: stampSyncRunId(quotes?.data ?? [], syncRunId),
    limits: stampSyncRunId(offExchangeSnapshot?.data.limits ?? [], syncRunId),
    fees: stampSyncRunId(offExchangeSnapshot?.data.fees ?? [], syncRunId),
    holdings: stampSyncRunId(holdings?.data ?? [], syncRunId)
  });
  if (areas.has("holding") && holdings && !holdings.isFallback) {
    finalizeStockHoldingIndex(db, syncRunId, qdiiHoldingsCatalog);
  }
  recordFundDiscoveryManifest(db, syncRunId, fundSnapshot.data, updatedAt);
  replaceDiscoveryProfileGaps(db, syncRunId, fundSnapshot.discoveryProfileGaps ?? [], updatedAt);
  const statuses: SyncStatusRow[] = [];
  if (areas.has("fund")) statuses.push({ area: "fund", durationMs: fundDurationMs, ...fundSnapshot.status, updatedAt });
  if (quotes && quoteDurationMs != null) statuses.push({ area: "quote", durationMs: quoteDurationMs, ...quotes.status, updatedAt });
  if (offExchangeSnapshot && offExchangeDurationMs != null) {
    statuses.push({ area: "purchaseLimit", durationMs: offExchangeDurationMs, ...offExchangeSnapshot.limitStatus, updatedAt });
    statuses.push({ area: "fee", durationMs: offExchangeDurationMs, ...offExchangeSnapshot.feeStatus, updatedAt });
  }
  if (holdings && holdingDurationMs != null) statuses.push({ area: "holding", durationMs: holdingDurationMs, ...holdings.status, updatedAt });

  for (const status of statuses) {
    recordSyncStatus(db, { ...status, updatedAt });
  }
  recordSyncRun(db, {
    syncRunId,
    status: statuses.some((status) => status.status === "error") ? "failed" : "completed",
    startedAt,
    completedAt: new Date().toISOString()
  });
  recordProviderResults(db, [
    ...toProviderResultRows(syncRunId, "fund", fundSnapshot.providerResults),
    ...(quotes ? toProviderResultRows(syncRunId, "quote", quotes.providerResults) : []),
    ...(offExchangeSnapshot ? toProviderResultRows(syncRunId, "offExchange", offExchangeSnapshot.providerResults) : []),
    ...(holdings ? toProviderResultRows(syncRunId, "holding", holdings.providerResults) : [])
  ]);
}

function createDailySyncRunId(date = new Date()): string {
  return `daily-${date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`;
}

function stampSyncRunId<T extends { syncRunId: string }>(rows: T[], syncRunId: string): T[] {
  return rows.map((row) => ({ ...row, syncRunId }));
}

function elapsedMs(now: () => number, startedAt: number): number {
  return Math.max(0, Math.round(now() - startedAt));
}

async function resolveFunds(db: Database.Database, options: DailySyncOptions): Promise<ResolvedData<Fund[]>> {
  const indexTargets = INDEX_TARGETS.map((target) => ({
    targetCode: target.code,
    targetName: target.name,
    aliases: target.aliases,
    seedFundCodes: INDEX_TARGET_FUND_SEEDS[target.code] ?? []
  }));
  const providers =
    options.fundProviders ??
    (options.useLiveProviders
      ? [
          createAgencyAugmentedFundDiscoveryProvider(
            createEastMoneyMultiTargetFundSearchProvider({ targets: indexTargets }),
            { targets: indexTargets }
          )
        ]
      : []);

  if (providers.length === 0) return resolvedOk(withCuratedFunds(mockFunds), "mock", latestFundDate(), true);

  try {
    const result = await runProviderChain(providers);
    let funds = result.data;
    if (options.useLiveProviders) {
      const stockScanDiscovered = await resolveStockScanFunds(options);
      funds = mergeFundsByCode([...funds, ...stockScanDiscovered]);
    }
    return resolvedOk(
      withCuratedFunds(funds),
      successSource(result.providerResults),
      successDataDate(result.providerResults),
      false,
      undefined,
      undefined,
      result.providerResults,
      result.discoveryProfileGaps
    );
  } catch (error) {
    const failure = providerFailure(error, providers);
    const attempts = providerAttempts(error);
    const rawCachedFunds = queryCachedFunds(db);
    if (rawCachedFunds.length > 0) {
      const cachedFunds = withCuratedFunds(rawCachedFunds);
      return resolvedFallback(cachedFunds, "local-cache", latestFundDate(), failure, 0, cachedFunds.length, attempts);
    }
    return resolvedFallback(withCuratedFunds(mockFunds), "mock", latestFundDate(), failure, undefined, undefined, attempts);
  }
}

function withCuratedFunds(funds: Fund[]): Fund[] {
  const byCode = new Map<string, Fund>();
  for (const fund of funds) byCode.set(fund.code, fund);

  // The curated catalog is authoritative for structural fields so that name-based
  // discovery cannot drop known products or lose share-class / parent relationships.
  for (const curated of [...STOCK_SCAN_FUNDS, ...INDEX_TARGET_FUND_SEED_FUNDS]) {
    const discovered = byCode.get(curated.code);
    if (!discovered) {
      byCode.set(curated.code, { ...curated, discoverySource: "catalog-seed" });
      continue;
    }
    byCode.set(curated.code, {
      ...discovered,
      venue: curated.venue,
      shareClass: curated.shareClass,
      fundType: curated.fundType || discovered.fundType,
      trackingTargetCode: curated.trackingTargetCode ?? discovered.trackingTargetCode,
      parentFundCode: curated.parentFundCode ?? discovered.parentFundCode,
      fundCompany: discovered.fundCompany?.trim() || curated.fundCompany,
      name: discovered.name || curated.name,
      enabled: isDelistedOnExchange(curated.code) ? false : true,
      discoverySource: discovered.discoverySource ?? "catalog-seed"
    });
  }
  return applyDelistedOnExchange([...byCode.values()]);
}

function applyDelistedOnExchange(funds: Fund[]): Fund[] {
  return funds.map((fund) =>
    fund.venue === "on_exchange" && isDelistedOnExchange(fund.code) ? { ...fund, enabled: false } : fund
  );
}

async function resolveStockScanFunds(options: DailySyncOptions): Promise<Fund[]> {
  try {
    if (options.stockScanFundDiscovery) return await options.stockScanFundDiscovery();
    return await discoverStockScanFunds();
  } catch {
    return [];
  }
}

async function resolveQuotes(db: Database.Database, options: DailySyncOptions, fundSnapshot: ResolvedData<Fund[]>): Promise<ResolvedData<FundQuote[]>> {
  const providers = options.quoteProviders ?? (options.useLiveProviders ? [createEastMoneyOnExchangeQuoteProvider(fundSnapshot.data)] : []);
  if (providers.length === 0) return resolvedOk(await enrichQuotes(db, mockQuotes), sourceFromQuotes(mockQuotes), latestQuoteDate(mockQuotes), true);

  try {
    const result = await runProviderChain(providers);
    const enriched = await enrichQuotes(db, result.data);
    const { quotes: withTurnover, backfillCount } = backfillStaleTurnover(db, enriched);
    const cachedQuotes = queryCachedQuotes(db, fundSnapshot.data, new Set(withTurnover.map((quote) => quote.fundCode)));
    const source = sourceFromQuotes(withTurnover) ?? successSource(result.providerResults);
    if (cachedQuotes.length > 0) {
      return resolvedFallback(
        [...withTurnover, ...cachedQuotes],
        `${source}+local-cache`,
        latestQuoteDate(result.data) ?? successDataDate(result.providerResults),
        { source: null, errorCategory: null, message: null },
        result.data.length,
        cachedQuotes.length,
        result.providerResults
      );
    }
    return resolvedOk(withTurnover, source, latestQuoteDate(result.data) ?? successDataDate(result.providerResults), false, result.data.length, 0, result.providerResults);
  } catch (error) {
    const failure = providerFailure(error, providers);
    const attempts = providerAttempts(error);
    const cachedQuotes = queryCachedQuotes(db, fundSnapshot.data);
    if (cachedQuotes.length > 0) {
      return resolvedFallback(cachedQuotes, "local-cache", latestQuoteDate(cachedQuotes), failure, 0, cachedQuotes.length, attempts);
    }
    if (!fundSnapshot.isFallback) return resolvedError([], failure, attempts);
    return resolvedFallback(await enrichQuotes(db, mockQuotes), sourceFromQuotes(mockQuotes), latestQuoteDate(mockQuotes), failure, undefined, undefined, attempts);
  }
}

async function enrichQuotes(db: Database.Database, quotes: FundQuote[], fetchImpl: typeof fetch = fetch): Promise<FundQuote[]> {
  const fundCodes = quotes.map((quote) => quote.fundCode);
  const quoteListByCode = fundCodes.length > 0
    ? await fetchEastMoneyQuoteListMap(fetchImpl, fundCodes)
    : new Map();

  return mapConcurrent(quotes, 6, async (quote) => {
    const quoteListRow = quoteListByCode.get(quote.fundCode) ?? null;
    let estimate: Awaited<ReturnType<typeof fetchFundReferenceEstimate>> = null;
    if (quote.iopv == null || quote.iopvTime?.endsWith(" 04:00")) {
      const fallback = await fetchFundReferenceEstimate(fetchImpl, quote.fundCode);
      estimate = mergeQuoteListIopv(quoteListRow, fallback, quote.tradeDate);
    }
    const enriched = enrichQuoteWithMatchedIopv(
      db,
      quote,
      estimate,
      tradeDateCloseMs(quote.tradeDate),
      quoteListRow
    );
    return normalizeOnExchangeQuoteSource(enriched);
  });
}

async function resolveOffExchangeSnapshot(db: Database.Database, options: DailySyncOptions, fundSnapshot: ResolvedData<Fund[]>): Promise<ResolvedOffExchange> {
  const providers = options.offExchangeProviders ?? (options.useLiveProviders ? [createMergedOffExchangeProvider(fundSnapshot.data)] : []);
  if (providers.length === 0) return resolvedOffExchangeOk({ limits: mockLimits, fees: mockFees }, "mock", true);

  try {
    const result = await runProviderChain(providers);
    return resolvedOffExchangeOk(result.data, successSource(result.providerResults), false, result.providerResults);
  } catch (error) {
    const failure = providerFailure(error, providers);
    const attempts = providerAttempts(error);
    const cached = queryCachedOffExchange(db, fundSnapshot.data);
    if (cached.limits.length > 0 || cached.fees.length > 0) {
      return resolvedOffExchangeFallback(cached, "local-cache", failure, attempts);
    }
    if (!fundSnapshot.isFallback) return resolvedOffExchangeError(failure, attempts);
    return resolvedOffExchangeFallback({ limits: mockLimits, fees: mockFees }, "tiantian", failure, attempts);
  }
}

async function resolveQdiiHoldingsCatalog(options: DailySyncOptions): Promise<Fund[]> {
  try {
    if (options.qdiiHoldingsCatalogLoader) return await options.qdiiHoldingsCatalogLoader();
    return await loadQdiiHoldingsCatalog();
  } catch {
    return [];
  }
}

async function resolveHoldings(
  db: Database.Database,
  options: DailySyncOptions,
  fundSnapshot: ResolvedData<Fund[]>,
  qdiiHoldingsCatalog: Fund[] = []
): Promise<ResolvedData<FundHolding[]>> {
  const holdingsFunds = mergeFundsForHoldingsSync(fundSnapshot.data, qdiiHoldingsCatalog);
  const cachedHoldingsByFundCode = queryCachedHoldingsByFundCode(db, holdingsFunds.map((fund) => fund.code));
  const providers = options.holdingProviders ?? (options.useLiveProviders
    ? [createEastMoneyHoldingsProvider(holdingsFunds, { cachedHoldingsByFundCode })]
    : []);
  if (providers.length === 0) return resolvedOk(mockHoldings, sourceFromHoldings(mockHoldings), latestHoldingPeriod(mockHoldings), true);

  try {
    const result = await runProviderChain(providers);
    return resolvedOk(result.data, successSource(result.providerResults), latestHoldingPeriod(result.data) ?? successDataDate(result.providerResults), false, undefined, undefined, result.providerResults);
  } catch (error) {
    const failure = providerFailure(error, providers);
    const attempts = providerAttempts(error);
    if (!fundSnapshot.isFallback) return resolvedError([], failure, attempts);
    return resolvedFallback(mockHoldings, sourceFromHoldings(mockHoldings), latestHoldingPeriod(mockHoldings), failure, undefined, undefined, attempts);
  }
}

function resolvedOk<T>(
  data: T[],
  source: string | null,
  dataDate: string | null,
  isFallback: boolean,
  freshItemCount?: number,
  cachedItemCount?: number,
  providerResults: ProviderAttempt[] = [],
  discoveryProfileGaps?: Array<{ targetCode: string; fundCode: string; venue: string }>
): ResolvedData<T[]> {
  return {
    data,
    isFallback,
    providerResults,
    discoveryProfileGaps,
    status: { status: "ok", source, dataDate, itemCount: data.length, freshItemCount, cachedItemCount }
  };
}

function resolvedFallback<T>(data: T[], source: string | null, dataDate: string | null, failure: ProviderFailure, freshItemCount?: number, cachedItemCount?: number, providerResults: ProviderAttempt[] = []): ResolvedData<T[]> {
  return {
    data,
    isFallback: true,
    providerResults,
    status: {
      status: "fallback",
      source,
      dataDate,
      itemCount: data.length,
      freshItemCount,
      cachedItemCount,
      errorCategory: failure.errorCategory,
      message: failure.message
    }
  };
}

function resolvedError<T>(data: T[], failure: ProviderFailure, providerResults: ProviderAttempt[] = []): ResolvedData<T[]> {
  return {
    data,
    isFallback: false,
    providerResults,
    status: {
      status: "error",
      source: failure.source,
      dataDate: null,
      itemCount: data.length,
      errorCategory: failure.errorCategory,
      message: failure.message
    }
  };
}

function resolvedOffExchangeOk(data: OffExchangeFeeLimitSnapshot, source: string | null, isFallback: boolean, providerResults: ProviderAttempt[] = []): ResolvedOffExchange {
  return {
    data,
    providerResults,
    limitStatus: { status: "ok", source, dataDate: latestLimitDate(data.limits), itemCount: data.limits.length },
    feeStatus: { status: "ok", source, dataDate: latestFeeDate(data.fees), itemCount: data.fees.length }
  };
}

function resolvedOffExchangeFallback(data: OffExchangeFeeLimitSnapshot, source: string | null, failure: ProviderFailure, providerResults: ProviderAttempt[] = []): ResolvedOffExchange {
  return {
    data,
    providerResults,
    limitStatus: {
      status: "fallback",
      source,
      dataDate: latestLimitDate(data.limits),
      itemCount: data.limits.length,
      errorCategory: failure.errorCategory,
      message: failure.message
    },
    feeStatus: {
      status: "fallback",
      source,
      dataDate: latestFeeDate(data.fees),
      itemCount: data.fees.length,
      errorCategory: failure.errorCategory,
      message: failure.message
    }
  };
}

function resolvedOffExchangeError(failure: ProviderFailure, providerResults: ProviderAttempt[] = []): ResolvedOffExchange {
  return {
    data: { limits: [], fees: [] },
    providerResults,
    limitStatus: { status: "error", source: failure.source, dataDate: null, itemCount: 0, errorCategory: failure.errorCategory, message: failure.message },
    feeStatus: { status: "error", source: failure.source, dataDate: null, itemCount: 0, errorCategory: failure.errorCategory, message: failure.message }
  };
}

interface ProviderFailure {
  source: string | null;
  errorCategory: string | null;
  message: string | null;
}

function providerFailure(error: unknown, providers: Array<DataProvider<unknown>>): ProviderFailure {
  const attempts = providerAttempts(error);
  const failed = findLastAttempt(attempts, (attempt) => !attempt.ok);
  return {
    source: failed?.providerName ?? providers[0]?.name ?? null,
    errorCategory: failed?.errorCategory ?? null,
    message: failed?.message ?? (error instanceof Error ? error.message : null)
  };
}

function providerAttempts(error: unknown): ProviderAttempt[] {
  return (error as { providerResults?: ProviderAttempt[] }).providerResults ?? [];
}

function toProviderResultRows(syncRunId: string, area: string, attempts: ProviderAttempt[]): ProviderResultRow[] {
  return attempts.map((attempt, index) => ({
    syncRunId,
    area,
    attemptOrder: index + 1,
    providerName: attempt.providerName,
    ok: attempt.ok,
    confidence: attempt.confidence,
    fetchedAt: attempt.fetchedAt,
    dataDate: attempt.dataDate,
    errorCategory: attempt.errorCategory,
    message: attempt.message,
    rawPayloadHash: attempt.rawPayloadHash
  }));
}

function successSource(attempts: ProviderAttempt[]): string | null {
  return findLastAttempt(attempts, (attempt) => attempt.ok)?.providerName ?? null;
}

function successDataDate(attempts: ProviderAttempt[]): string | null {
  return findLastAttempt(attempts, (attempt) => attempt.ok)?.dataDate ?? null;
}

function findLastAttempt(attempts: ProviderAttempt[], predicate: (attempt: ProviderAttempt) => boolean): ProviderAttempt | undefined {
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    if (predicate(attempts[index])) return attempts[index];
  }
  return undefined;
}

function latestFundDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function sourceFromQuotes(rows: FundQuote[]): string | null {
  return rows[0]?.source ?? "mock";
}

function sourceFromHoldings(rows: FundHolding[]): string | null {
  return rows[0]?.source ?? "mock";
}

function latestQuoteDate(rows: FundQuote[]): string | null {
  return latest(rows.map((row) => row.tradeDate));
}

function latestLimitDate(rows: OffExchangeFeeLimitSnapshot["limits"]): string | null {
  return latest(rows.map((row) => row.dataDate));
}

function latestFeeDate(rows: OffExchangeFeeLimitSnapshot["fees"]): string | null {
  return latest(rows.map((row) => row.dataDate));
}

function latestHoldingPeriod(rows: FundHolding[]): string | null {
  return latest(rows.map((row) => row.reportPeriod));
}

function latest(values: string[]): string | null {
  return values.filter(Boolean).sort().at(-1) ?? null;
}

function queryCachedFunds(db: Database.Database): Fund[] {
  type CachedFundRow = Omit<Fund, "enabled" | "trackingTargetCode" | "fundCompany" | "parentFundCode"> & {
    enabled: number;
    trackingTargetCode: string | null;
    fundCompany: string | null;
    parentFundCode: string | null;
  };

  return (db.prepare(`
    SELECT
      code,
      name,
      fund_type AS fundType,
      venue,
      fund_company AS fundCompany,
      tracking_target_code AS trackingTargetCode,
      share_class AS shareClass,
      parent_fund_code AS parentFundCode,
      enabled
    FROM funds
    WHERE enabled = 1
  `).all() as CachedFundRow[]).map((fund) => {
    return {
      ...fund,
      fundCompany: fund.fundCompany ?? undefined,
      trackingTargetCode: fund.trackingTargetCode ?? undefined,
      parentFundCode: fund.parentFundCode ?? undefined,
      enabled: fund.enabled === 1
    };
  });
}

function backfillStaleTurnover(db: Database.Database, quotes: FundQuote[]): { quotes: FundQuote[]; backfillCount: number } {
  const missingCodes = quotes.filter((quote) => quote.turnover == null).map((quote) => quote.fundCode);
  if (missingCodes.length === 0) return { quotes, backfillCount: 0 };

  const staleByCode = queryCachedTurnoverByFundCode(db, missingCodes);
  let backfillCount = 0;
  const updated = quotes.map((quote) => {
    if (quote.turnover != null) return quote;
    const stale = staleByCode.get(quote.fundCode);
    if (!stale) return quote;
    backfillCount += 1;
    return {
      ...quote,
      turnover: stale.turnover,
      source: quote.source.includes("stale-turnover") ? quote.source : `${quote.source}+stale-turnover`
    };
  });
  return { quotes: updated, backfillCount };
}

function queryCachedTurnoverByFundCode(db: Database.Database, fundCodes: string[]): Map<string, { turnover: number }> {
  if (fundCodes.length === 0) return new Map();
  const placeholders = fundCodes.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT fund_code AS fundCode, turnover
    FROM fund_quotes q
    WHERE fund_code IN (${placeholders})
      AND turnover IS NOT NULL
      AND q.rowid = (
        SELECT q2.rowid
        FROM fund_quotes q2
        WHERE q2.fund_code = q.fund_code
          AND q2.turnover IS NOT NULL
        ORDER BY q2.trade_date DESC,
          CASE q2.source
            WHEN 'eastmoney-on-exchange-quote' THEN 0
            WHEN 'eastmoney-on-exchange-spot' THEN 1
            WHEN 'eastmoney' THEN 2
            ELSE 3
          END
        LIMIT 1
      )
  `).all(...fundCodes) as Array<{ fundCode: string; turnover: number }>;
  return new Map(rows.map((row) => [row.fundCode, { turnover: row.turnover }]));
}

function queryCachedQuotes(db: Database.Database, funds: Fund[], excludeFundCodes = new Set<string>()): FundQuote[] {
  const fundCodes = funds
    .filter((fund) => fund.enabled && fund.venue === "on_exchange" && !excludeFundCodes.has(fund.code))
    .map((fund) => fund.code);
  if (fundCodes.length === 0) return [];

  const placeholders = fundCodes.map(() => "?").join(",");
  return db.prepare(`
    SELECT
      fund_code AS fundCode,
      close_price AS closePrice,
      closing_premium_discount_rate AS closingPremiumDiscountRate,
      unit_nav AS unitNav,
      nav_date AS navDate,
      turnover,
      trade_date AS tradeDate,
      source,
      sync_run_id AS syncRunId
    FROM fund_quotes q
    WHERE fund_code IN (${placeholders})
      AND q.rowid = (
        SELECT q2.rowid
        FROM fund_quotes q2
        WHERE q2.fund_code = q.fund_code
        ORDER BY q2.trade_date DESC,
          CASE q2.source WHEN 'eastmoney-on-exchange-quote' THEN 0 WHEN 'eastmoney-on-exchange-spot' THEN 1 WHEN 'eastmoney' THEN 2 ELSE 3 END
        LIMIT 1
      )
  `).all(...fundCodes) as FundQuote[];
}

function queryCachedOffExchange(db: Database.Database, funds: Fund[]): OffExchangeFeeLimitSnapshot {
  const fundCodes = funds
    .filter((fund) => fund.enabled && fund.venue === "off_exchange")
    .map((fund) => fund.code);
  if (fundCodes.length === 0) return { limits: [], fees: [] };

  const placeholders = fundCodes.map(() => "?").join(",");
  const limits = db.prepare(`
    SELECT
      fund_code AS fundCode,
      share_class AS shareClass,
      status,
      limit_amount_yuan AS limitAmountYuan,
      limit_unit AS limitUnit,
      channel_scope AS channelScope,
      source,
      data_date AS dataDate,
      confidence,
      sync_run_id AS syncRunId
    FROM purchase_limits l
    WHERE fund_code IN (${placeholders})
      AND l.rowid = (
        SELECT l2.rowid
        FROM purchase_limits l2
        WHERE l2.fund_code = l.fund_code
        ORDER BY l2.data_date DESC,
          CASE l2.source WHEN 'tiantian-f10-jjfl' THEN 0 WHEN 'tiantian' THEN 1 ELSE 2 END,
          l2.confidence DESC
        LIMIT 1
      )
  `).all(...fundCodes) as PurchaseLimit[];
  const fees = db.prepare(`
    SELECT
      fund_code AS fundCode,
      fee_type AS feeType,
      rate,
      min_holding_days AS minHoldingDays,
      max_holding_days AS maxHoldingDays,
      amount_tier_lower_bound AS amountTierLowerBound,
      amount_tier_upper_bound AS amountTierUpperBound,
      channel_scope AS channelScope,
      source,
      data_date AS dataDate,
      sync_run_id AS syncRunId
    FROM fund_fees f
    WHERE fund_code IN (${placeholders})
      AND f.data_date = (
        SELECT f2.data_date
        FROM fund_fees f2
        WHERE f2.fund_code = f.fund_code
        ORDER BY f2.data_date DESC,
          CASE f2.source WHEN 'tiantian-f10-jjfl' THEN 0 WHEN 'tiantian' THEN 1 ELSE 2 END
        LIMIT 1
      )
      AND f.source = (
        SELECT f3.source
        FROM fund_fees f3
        WHERE f3.fund_code = f.fund_code
        ORDER BY f3.data_date DESC,
          CASE f3.source WHEN 'tiantian-f10-jjfl' THEN 0 WHEN 'tiantian' THEN 1 ELSE 2 END
        LIMIT 1
      )
  `).all(...fundCodes) as FeeTier[];

  return { limits, fees };
}
