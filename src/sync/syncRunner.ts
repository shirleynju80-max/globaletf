import type Database from "better-sqlite3";
import { insertSnapshotBundle, recordSyncStatus, type SyncStatusRow } from "../db/repositories";
import { findTargetByCode } from "../domain/targets";
import type { Fund, FundHolding, FundQuote } from "../domain/types";
import { createEastMoneyFundSearchProvider } from "../providers/eastmoneyFundSearch";
import { createEastMoneyHoldingsProvider } from "../providers/eastmoneyHoldings";
import { createEastMoneyOnExchangeQuoteProvider } from "../providers/eastmoneyOnExchangeQuotes";
import { mockFees, mockFunds, mockHoldings, mockLimits, mockQuotes } from "../providers/mockProviders";
import { createEastMoneyF10OffExchangeProvider, type OffExchangeFeeLimitSnapshot } from "../providers/eastmoneyF10";
import { runProviderChain } from "../providers/providerChain";
import type { DataProvider, ProviderAttempt } from "../providers/types";

interface DailySyncOptions {
  useLiveProviders?: boolean;
  fundProviders?: DataProvider<Fund[]>[];
  quoteProviders?: DataProvider<FundQuote[]>[];
  offExchangeProviders?: DataProvider<OffExchangeFeeLimitSnapshot>[];
  holdingProviders?: DataProvider<FundHolding[]>[];
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
  const fundSnapshot = await resolveFunds(options);
  const quotes = await resolveQuotes(options, fundSnapshot);
  const offExchangeSnapshot = await resolveOffExchangeSnapshot(options, fundSnapshot);
  const holdings = await resolveHoldings(options, fundSnapshot);

  insertSnapshotBundle(db, {
    syncRunId: "mock-run",
    funds: fundSnapshot.data,
    quotes: quotes.data,
    limits: offExchangeSnapshot.data.limits,
    fees: offExchangeSnapshot.data.fees,
    holdings: holdings.data
  });

  const updatedAt = new Date().toISOString();
  for (const status of [
    { area: "fund" as const, ...fundSnapshot.status },
    { area: "quote" as const, ...quotes.status },
    { area: "purchaseLimit" as const, ...offExchangeSnapshot.limitStatus },
    { area: "fee" as const, ...offExchangeSnapshot.feeStatus },
    { area: "holding" as const, ...holdings.status }
  ]) {
    recordSyncStatus(db, { ...status, updatedAt });
  }
}

async function resolveFunds(options: DailySyncOptions): Promise<ResolvedData<Fund[]>> {
  const target = findTargetByCode("NASDAQ_100");
  const providers =
    options.fundProviders ??
    (options.useLiveProviders && target
      ? [createEastMoneyFundSearchProvider({ targetCode: target.code, targetName: target.name, aliases: target.aliases })]
      : []);

  if (providers.length === 0) return resolvedOk(mockFunds, "mock", latestFundDate(), true);

  try {
    const result = await runProviderChain(providers);
    return resolvedOk(result.data, successSource(result.providerResults), successDataDate(result.providerResults), false);
  } catch (error) {
    return resolvedFallback(mockFunds, "mock", latestFundDate(), providerFailure(error, providers));
  }
}

async function resolveQuotes(options: DailySyncOptions, fundSnapshot: ResolvedData<Fund[]>): Promise<ResolvedData<FundQuote[]>> {
  const providers = options.quoteProviders ?? (options.useLiveProviders ? [createEastMoneyOnExchangeQuoteProvider(fundSnapshot.data)] : []);
  if (providers.length === 0) return resolvedOk(mockQuotes, sourceFromQuotes(mockQuotes), latestQuoteDate(mockQuotes), true);

  try {
    const result = await runProviderChain(providers);
    return resolvedOk(result.data, successSource(result.providerResults), latestQuoteDate(result.data) ?? successDataDate(result.providerResults), false);
  } catch (error) {
    const failure = providerFailure(error, providers);
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

function resolvedOk<T>(data: T[], source: string | null, dataDate: string | null, isFallback: boolean): ResolvedData<T[]> {
  return {
    data,
    isFallback,
    status: { status: "ok", source, dataDate, itemCount: data.length }
  };
}

function resolvedFallback<T>(data: T[], source: string | null, dataDate: string | null, failure: ProviderFailure): ResolvedData<T[]> {
  return {
    data,
    isFallback: true,
    status: {
      status: "fallback",
      source,
      dataDate,
      itemCount: data.length,
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
