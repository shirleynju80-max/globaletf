import type Database from "better-sqlite3";
import { insertSnapshotBundle } from "../db/repositories";
import { mockFees, mockFunds, mockHoldings, mockLimits, mockQuotes } from "../providers/mockProviders";
import { createEastMoneyF10OffExchangeProvider, type OffExchangeFeeLimitSnapshot } from "../providers/eastmoneyF10";
import { runProviderChain } from "../providers/providerChain";
import type { DataProvider } from "../providers/types";

interface DailySyncOptions {
  useLiveProviders?: boolean;
  offExchangeProviders?: DataProvider<OffExchangeFeeLimitSnapshot>[];
}

export async function runDailySync(db: Database.Database, options: DailySyncOptions = {}): Promise<void> {
  const offExchangeSnapshot = await resolveOffExchangeSnapshot(options);

  insertSnapshotBundle(db, {
    syncRunId: "mock-run",
    funds: mockFunds,
    quotes: mockQuotes,
    limits: offExchangeSnapshot.limits,
    fees: offExchangeSnapshot.fees,
    holdings: mockHoldings
  });
}

async function resolveOffExchangeSnapshot(options: DailySyncOptions): Promise<OffExchangeFeeLimitSnapshot> {
  const providers = options.offExchangeProviders ?? (options.useLiveProviders ? [createEastMoneyF10OffExchangeProvider(mockFunds)] : []);
  if (providers.length === 0) return { limits: mockLimits, fees: mockFees };

  try {
    const result = await runProviderChain(providers);
    return result.data;
  } catch {
    return { limits: mockLimits, fees: mockFees };
  }
}
