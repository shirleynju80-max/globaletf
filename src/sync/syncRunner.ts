import type Database from "better-sqlite3";
import { insertSnapshotBundle } from "../db/repositories";
import { mockFees, mockFunds, mockHoldings, mockLimits, mockQuotes } from "../providers/mockProviders";

export async function runDailySync(db: Database.Database): Promise<void> {
  insertSnapshotBundle(db, {
    syncRunId: "mock-run",
    funds: mockFunds,
    quotes: mockQuotes,
    limits: mockLimits,
    fees: mockFees,
    holdings: mockHoldings
  });
}
