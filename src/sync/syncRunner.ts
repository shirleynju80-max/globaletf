import type Database from "better-sqlite3";
import { insertSnapshotBundle, recordSyncStatus, type SyncStatusRow } from "../db/repositories";
import { INDEX_TARGETS } from "../domain/targets";
import type { Fund, FundHolding, FundQuote } from "../domain/types";
import { createEastMoneyMultiTargetFundSearchProvider } from "../providers/eastmoneyFundSearch";
import { createEastMoneyHoldingsProvider } from "../providers/eastmoneyHoldings";
import { createEastMoneyOnExchangeQuoteProvider } from "../providers/eastmoneyOnExchangeQuotes";
import { mockFees, mockFunds, mockHoldings, mockLimits, mockQuotes } from "../providers/mockProviders";
import { createEastMoneyF10OffExchangeProvider, type OffExchangeFeeLimitSnapshot } from "../providers/eastmoneyF10";
import { runProviderChain } from "../providers/providerChain";
import type { DataProvider, ProviderAttempt } from "../providers/types";

export type SyncArea = "fund" | "quote" | "offExchange" | "holding";

interface DailySyncOptions {
  useLiveProviders?: boolean;
  areas?: SyncArea[];
  fundProviders?: DataProvider<Fund[]>[];
  quoteProviders?: DataProvider<FundQuote[]>[];
  offExchangeProviders?: DataProvider<OffExchangeFeeLimitSnapshot>[];
  holdingProviders?: DataProvider<FundHolding[]>[];
  now?: () => number;
}

interface ResolvedData<T> {
  data: T;
  isFallback: boolean;
  status: Omit<SyncStatusRow, "area" | "updatedAt">;
}

interface ResolvedOffExchange {
  data: OffExchangeFeeLimitSnapshot;
  limitStatus: Omit<SyncStatusRow, "area" | "updatedAt">;
  feeStatus: Omit<SyncStatusRow, "area" | "updatedAt">;
}

export async function runDailySync(db: Database.Database, options: DailySyncOptions = {}): Promise<void> {
  const areas = new Set(options.areas?.length ? options.areas : ["fund", "quote", "offExchange", "holding"]);
  const syncRunId = createDailySyncRunId();
  const now = options.now ?? Date.now;
  const fundStartedAt = now();
  const fundSnapshot = await resolveFunds(options);
  const fundDurationMs = elapsedMs(now, fundStartedAt);
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
    offExchangeSnapshot = await resolveOffExchangeSnapshot(options, fundSnapshot);
    offExchangeDurationMs = elapsedMs(now, offExchangeStartedAt);
  }
  let holdings: ResolvedData<FundHolding[]> | undefined;
  let holdingDurationMs: number | undefined;
  if (areas.has("holding")) {
    const holdingStartedAt = now();
    holdings = await resolveHoldings(options, fundSnapshot);
    holdingDurationMs = elapsedMs(now, holdingStartedAt);
  }

  insertSnapshotBundle(db, {
    syncRunId,
    funds: fundSnapshot.data,
    quotes: stampSyncRunId(quotes?.data ?? [], syncRunId),
    limits: stampSyncRunId(offExchangeSnapshot?.data.limits ?? [], syncRunId),
    fees: stampSyncRunId(offExchangeSnapshot?.data.fees ?? [], syncRunId),
    holdings: stampSyncRunId(holdings?.data ?? [], syncRunId)
  });

  const updatedAt = new Date().toISOString();
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

async function resolveFunds(options: DailySyncOptions): Promise<ResolvedData<Fund[]>> {
  const providers =
    options.fundProviders ??
    (options.useLiveProviders
      ? [createEastMoneyMultiTargetFundSearchProvider({
          targets: INDEX_TARGETS.map((target) => ({
            targetCode: target.code,
            targetName: target.name,
            aliases: target.aliases
          }))
        })]
      : []);

  if (providers.length === 0) return resolvedOk(mockFunds, "mock", latestFundDate(), true);

  try {
    const result = await runProviderChain(providers);
    return resolvedOk(result.data, successSource(result.providerResults), successDataDate(result.providerResults), false);
  } catch (error) {
    return resolvedFallback(mockFunds, "mock", latestFundDate(), providerFailure(error, providers));
  }
}

async function resolveQuotes(db: Database.Database, options: DailySyncOptions, fundSnapshot: ResolvedData<Fund[]>): Promise<ResolvedData<FundQuote[]>> {
  const providers = options.quoteProviders ?? (options.useLiveProviders ? [createEastMoneyOnExchangeQuoteProvider(fundSnapshot.data)] : []);
  if (providers.length === 0) return resolvedOk(mockQuotes, sourceFromQuotes(mockQuotes), latestQuoteDate(mockQuotes), true);

  try {
    const result = await runProviderChain(providers);
    const cachedQuotes = queryCachedQuotes(db, fundSnapshot.data, new Set(result.data.map((quote) => quote.fundCode)));
    if (cachedQuotes.length > 0) {
      return resolvedFallback(
        [...result.data, ...cachedQuotes],
        `${sourceFromQuotes(result.data) ?? successSource(result.providerResults)}+local-cache`,
        latestQuoteDate(result.data) ?? successDataDate(result.providerResults),
        { source: null, errorCategory: null, message: null },
        result.data.length,
        cachedQuotes.length
      );
    }
    return resolvedOk(result.data, sourceFromQuotes(result.data) ?? successSource(result.providerResults), latestQuoteDate(result.data) ?? successDataDate(result.providerResults), false, result.data.length, 0);
  } catch (error) {
    const failure = providerFailure(error, providers);
    const cachedQuotes = queryCachedQuotes(db, fundSnapshot.data);
    if (cachedQuotes.length > 0) {
      return resolvedFallback(cachedQuotes, "local-cache", latestQuoteDate(cachedQuotes), failure, 0, cachedQuotes.length);
    }
    if (!fundSnapshot.isFallback) return resolvedError([], failure);
    return resolvedFallback(mockQuotes, sourceFromQuotes(mockQuotes), latestQuoteDate(mockQuotes), failure);
  }
}

async function resolveOffExchangeSnapshot(options: DailySyncOptions, fundSnapshot: ResolvedData<Fund[]>): Promise<ResolvedOffExchange> {
  const providers = options.offExchangeProviders ?? (options.useLiveProviders ? [createEastMoneyF10OffExchangeProvider(fundSnapshot.data)] : []);
  if (providers.length === 0) return resolvedOffExchangeOk({ limits: mockLimits, fees: mockFees }, "mock", true);

  try {
    const result = await runProviderChain(providers);
    return resolvedOffExchangeOk(result.data, successSource(result.providerResults), false);
  } catch (error) {
    const failure = providerFailure(error, providers);
    if (!fundSnapshot.isFallback) return resolvedOffExchangeError(failure);
    return resolvedOffExchangeFallback({ limits: mockLimits, fees: mockFees }, "tiantian", failure);
  }
}

async function resolveHoldings(options: DailySyncOptions, fundSnapshot: ResolvedData<Fund[]>): Promise<ResolvedData<FundHolding[]>> {
  const providers = options.holdingProviders ?? (options.useLiveProviders ? [createEastMoneyHoldingsProvider(fundSnapshot.data)] : []);
  if (providers.length === 0) return resolvedOk(mockHoldings, sourceFromHoldings(mockHoldings), latestHoldingPeriod(mockHoldings), true);

  try {
    const result = await runProviderChain(providers);
    return resolvedOk(result.data, successSource(result.providerResults), latestHoldingPeriod(result.data) ?? successDataDate(result.providerResults), false);
  } catch (error) {
    const failure = providerFailure(error, providers);
    if (!fundSnapshot.isFallback) return resolvedError([], failure);
    return resolvedFallback(mockHoldings, sourceFromHoldings(mockHoldings), latestHoldingPeriod(mockHoldings), failure);
  }
}

function resolvedOk<T>(data: T[], source: string | null, dataDate: string | null, isFallback: boolean, freshItemCount?: number, cachedItemCount?: number): ResolvedData<T[]> {
  return {
    data,
    isFallback,
    status: { status: "ok", source, dataDate, itemCount: data.length, freshItemCount, cachedItemCount }
  };
}

function resolvedFallback<T>(data: T[], source: string | null, dataDate: string | null, failure: ProviderFailure, freshItemCount?: number, cachedItemCount?: number): ResolvedData<T[]> {
  return {
    data,
    isFallback: true,
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

function resolvedError<T>(data: T[], failure: ProviderFailure): ResolvedData<T[]> {
  return {
    data,
    isFallback: false,
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

function resolvedOffExchangeOk(data: OffExchangeFeeLimitSnapshot, source: string | null, isFallback: boolean): ResolvedOffExchange {
  return {
    data,
    limitStatus: { status: "ok", source, dataDate: latestLimitDate(data.limits), itemCount: data.limits.length },
    feeStatus: { status: "ok", source, dataDate: latestFeeDate(data.fees), itemCount: data.fees.length }
  };
}

function resolvedOffExchangeFallback(data: OffExchangeFeeLimitSnapshot, source: string | null, failure: ProviderFailure): ResolvedOffExchange {
  return {
    data,
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

function resolvedOffExchangeError(failure: ProviderFailure): ResolvedOffExchange {
  return {
    data: { limits: [], fees: [] },
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
  const attempts = (error as { providerResults?: ProviderAttempt[] }).providerResults ?? [];
  const failed = findLastAttempt(attempts, (attempt) => !attempt.ok);
  return {
    source: failed?.providerName ?? providers[0]?.name ?? null,
    errorCategory: failed?.errorCategory ?? null,
    message: failed?.message ?? (error instanceof Error ? error.message : null)
  };
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
