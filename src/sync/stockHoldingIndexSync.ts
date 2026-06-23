import type Database from "better-sqlite3";
import { isExcludedIndexDiscoveryName } from "../domain/fundDiscovery";
import { lookupStockKey } from "../domain/stockHoldingIndex";
import type { Fund } from "../domain/types";
import { rebuildStockFundIndex } from "../db/repositories";

export { rebuildStockFundIndex };

export function upsertHoldingsScanFunds(db: Database.Database, funds: Fund[]): void {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO funds (
      code, name, fund_type, venue, fund_company, tracking_target_code, share_class, parent_fund_code, enabled
    ) VALUES (
      @code, @name, @fundType, @venue, @fundCompany, @trackingTargetCode, @shareClass, @parentFundCode, @enabled
    )
  `);

  const tx = db.transaction(() => {
    for (const fund of funds) {
      insert.run({
        ...fund,
        fundCompany: fund.fundCompany ?? null,
        trackingTargetCode: fund.trackingTargetCode ?? null,
        parentFundCode: fund.parentFundCode ?? null,
        enabled: 0
      });
    }
  });
  tx();
}

/** Enable funds whose latest F10 jjcc disclosures appear in stock_fund_index. */
export function enableFundsWithHoldingsDisclosures(db: Database.Database): string[] {
  const codes = (db.prepare(`
    SELECT DISTINCT fund_code AS fundCode
    FROM stock_fund_index
  `).all() as Array<{ fundCode: string }>).map((row) => row.fundCode);

  const enable = db.prepare("UPDATE funds SET enabled = 1 WHERE code = ?");
  const enableWithoutIndexTag = db.prepare("UPDATE funds SET enabled = 1, tracking_target_code = NULL WHERE code = ?");
  const fundRows = db.prepare(`
    SELECT code, name, tracking_target_code AS trackingTargetCode
    FROM funds
    WHERE code IN (${codes.map(() => "?").join(",") || "NULL"})
  `).all(...codes) as Array<{ code: string; name: string; trackingTargetCode: string | null }>;
  const fundByCode = new Map(fundRows.map((row) => [row.code, row]));

  const tx = db.transaction(() => {
    for (const fundCode of codes) {
      const fund = fundByCode.get(fundCode);
      if (fund?.trackingTargetCode && isExcludedIndexDiscoveryName(fund.name, fund.trackingTargetCode)) {
        enableWithoutIndexTag.run(fundCode);
        continue;
      }
      enable.run(fundCode);
    }
  });
  tx();
  return codes;
}

export interface FinalizeStockHoldingIndexResult {
  indexRows: number;
  enabledFundCodes: string[];
}

export function finalizeStockHoldingIndex(
  db: Database.Database,
  syncRunId: string,
  qdiiScanFunds: Fund[]
): FinalizeStockHoldingIndexResult {
  upsertHoldingsScanFunds(db, qdiiScanFunds);
  const indexRows = rebuildStockFundIndex(db, syncRunId);
  const enabledFundCodes = enableFundsWithHoldingsDisclosures(db);
  return { indexRows, enabledFundCodes };
}

export function countStockIndexFunds(db: Database.Database, stockCode: string): number {
  const stockKey = lookupStockKey(stockCode);
  const row = db.prepare(`
    SELECT COUNT(DISTINCT fund_code) AS count
    FROM stock_fund_index
    WHERE stock_key = ?
  `).get(stockKey) as { count: number };
  return row.count;
}
