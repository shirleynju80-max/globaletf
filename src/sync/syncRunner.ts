import type Database from "better-sqlite3";
import { insertSnapshotBundle } from "../db/repositories";
import { findTargetByCode } from "../domain/targets";
import type { Fund, FundHolding, FundQuote } from "../domain/types";
import { createEastMoneyFundSearchProvider } from "../providers/eastmoneyFundSearch";
import { createEastMoneyHoldingsProvider } from "../providers/eastmoneyHoldings";
import { createEastMoneyOnExchangeQuoteProvider } from "../providers/eastmoneyOnExchangeQuotes";
import { mockFees, mockFunds, mockHoldings, mockLimits, mockQuotes } from "../providers/mockProviders";
import { createEastMoneyF10OffExchangeProvider, type OffExchangeFeeLimitSnapshot } from "../providers/eastmoneyF10";
import { runProviderChain } from "../providers/providerChain";
import type { DataProvider } from "../providers/types";

interface DailySyncOptions {
  useLiveProviders?: boolean;
  fundProviders?: DataProvider<Fund[]>[];
  quoteProviders?: DataProvider<FundQuote[]>[];
  offExchangeProviders?: DataProvider<OffExchangeFeeLimitSnapshot>[];
  holdingProviders?: DataProvider<FundHolding[]>[];
}

export async function runDailySync(db: Database.Database, options: DailySyncOptions = {}): Promise<void> {
  const fundSnapshot = await resolveFunds(options);
  const quotes = await resolveQuotes(options, fundSnapshot);
  const offExchangeSnapshot = await resolveOffExchangeSnapshot(options, fundSnapshot);
  const holdings = await resolveHoldings(options, fundSnapshot);

  insertSnapshotBundle(db, {
    syncRunId: "mock-run",
    funds: fundSnapshot.funds,
    quotes,
    limits: offExchangeSnapshot.limits,
    fees: offExchangeSnapshot.fees,
    holdings
  });
}

async function resolveFunds(options: DailySyncOptions): Promise<{ funds: Fund[]; isFallback: boolean }> {
  const target = findTargetByCode("NASDAQ_100");
  const providers =
    options.fundProviders ??
    (options.useLiveProviders && target
      ? [createEastMoneyFundSearchProvider({ targetCode: target.code, targetName: target.name, aliases: target.aliases })]
      : []);

  if (providers.length === 0) return { funds: mockFunds, isFallback: true };

  try {
    const result = await runProviderChain(providers);
    return { funds: result.data, isFallback: false };
  } catch {
    return { funds: mockFunds, isFallback: true };
  }
}

async function resolveQuotes(options: DailySyncOptions, fundSnapshot: { funds: Fund[]; isFallback: boolean }): Promise<FundQuote[]> {
  const providers = options.quoteProviders ?? (options.useLiveProviders ? [createEastMoneyOnExchangeQuoteProvider(fundSnapshot.funds)] : []);
  if (providers.length === 0) return mockQuotes;

  try {
    const result = await runProviderChain(providers);
    return result.data;
  } catch {
    if (!fundSnapshot.isFallback) return [];
    return mockQuotes;
  }
}

async function resolveOffExchangeSnapshot(options: DailySyncOptions, fundSnapshot: { funds: Fund[]; isFallback: boolean }): Promise<OffExchangeFeeLimitSnapshot> {
  const providers = options.offExchangeProviders ?? (options.useLiveProviders ? [createEastMoneyF10OffExchangeProvider(fundSnapshot.funds)] : []);
  if (providers.length === 0) return { limits: mockLimits, fees: mockFees };

  try {
    const result = await runProviderChain(providers);
    return result.data;
  } catch {
    if (!fundSnapshot.isFallback) return { limits: [], fees: [] };
    return { limits: mockLimits, fees: mockFees };
  }
}

async function resolveHoldings(options: DailySyncOptions, fundSnapshot: { funds: Fund[]; isFallback: boolean }): Promise<FundHolding[]> {
  const providers = options.holdingProviders ?? (options.useLiveProviders ? [createEastMoneyHoldingsProvider(fundSnapshot.funds)] : []);
  if (providers.length === 0) return mockHoldings;

  try {
    const result = await runProviderChain(providers);
    return result.data;
  } catch {
    if (!fundSnapshot.isFallback) return [];
    return mockHoldings;
  }
}
