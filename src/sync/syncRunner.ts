import type Database from "better-sqlite3";
import { insertSnapshotBundle } from "../db/repositories";
import { findTargetByCode } from "../domain/targets";
import type { Fund } from "../domain/types";
import { createEastMoneyFundSearchProvider } from "../providers/eastmoneyFundSearch";
import { mockFees, mockFunds, mockHoldings, mockLimits, mockQuotes } from "../providers/mockProviders";
import { createEastMoneyF10OffExchangeProvider, type OffExchangeFeeLimitSnapshot } from "../providers/eastmoneyF10";
import { runProviderChain } from "../providers/providerChain";
import type { DataProvider } from "../providers/types";

interface DailySyncOptions {
  useLiveProviders?: boolean;
  fundProviders?: DataProvider<Fund[]>[];
  offExchangeProviders?: DataProvider<OffExchangeFeeLimitSnapshot>[];
}

export async function runDailySync(db: Database.Database, options: DailySyncOptions = {}): Promise<void> {
  const fundSnapshot = await resolveFunds(options);
  const offExchangeSnapshot = await resolveOffExchangeSnapshot(options, fundSnapshot);

  insertSnapshotBundle(db, {
    syncRunId: "mock-run",
    funds: fundSnapshot.funds,
    quotes: mockQuotes,
    limits: offExchangeSnapshot.limits,
    fees: offExchangeSnapshot.fees,
    holdings: mockHoldings
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
