import type Database from "better-sqlite3";
import type { FundReturnSnapshot } from "../domain/fundReturnPeriods";
import type { Fund } from "../domain/types";
import { upsertFundReturnSnapshots, type SyncStatusRow } from "../db/repositories";
import { fetchFundReturnSnapshots } from "../providers/fundHistoricalReturns";

interface SyncFundReturnsOptions {
  fetchImpl?: typeof fetch;
  concurrency?: number;
}

export async function syncFundReturns(
  db: Database.Database,
  syncRunId: string,
  funds: Fund[],
  options: SyncFundReturnsOptions = {}
): Promise<Omit<SyncStatusRow, "area" | "updatedAt">> {
  const startedAt = Date.now();
  const targets = funds
    .filter((fund) => fund.enabled)
    .map((fund) => ({ fundCode: fund.code, venue: fund.venue }));

  if (targets.length === 0) {
    return {
      status: "ok",
      source: "cached",
      dataDate: null,
      itemCount: 0,
      freshItemCount: 0,
      cachedItemCount: 0,
      durationMs: 0
    };
  }

  const snapshots = await fetchFundReturnSnapshots(targets, {
    fetchImpl: options.fetchImpl,
    concurrency: options.concurrency ?? 8
  });
  const updatedAt = new Date().toISOString();
  const venueByCode = new Map(funds.map((fund) => [fund.code, fund.venue]));
  const rows = Object.values(snapshots)
    .filter((snapshot): snapshot is FundReturnSnapshot => snapshot != null)
    .map((snapshot) => ({
      snapshot,
      venue: venueByCode.get(snapshot.fundCode) ?? "off_exchange"
    }));

  upsertFundReturnSnapshots(db, rows, syncRunId, updatedAt);

  const asOfDates = rows.map((row) => row.snapshot.asOfDate).sort();
  return {
    status: "ok",
    source: "eastmoney+tencent",
    dataDate: asOfDates.at(-1) ?? null,
    itemCount: rows.length,
    freshItemCount: rows.length,
    cachedItemCount: 0,
    durationMs: Math.max(0, Date.now() - startedAt)
  };
}
