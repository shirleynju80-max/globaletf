import type Database from "better-sqlite3";
import type { FeeTier, Fund, FundHolding, FundQuote, PurchaseLimit } from "../domain/types";

export interface SnapshotBundle {
  syncRunId: string;
  funds: Fund[];
  quotes: FundQuote[];
  limits: PurchaseLimit[];
  fees: FeeTier[];
  holdings: FundHolding[];
}

interface IndexComparisonRow {
  code: string;
  name: string;
  venue: "on_exchange" | "off_exchange";
  shareClass: string;
  closePrice?: number;
  closingPremiumDiscountRate: number | null;
  turnover?: number;
  tradeDate?: string;
  status?: string;
  limitAmountYuan?: number;
  channelScope?: string;
  source?: string;
}

export function insertSnapshotBundle(db: Database.Database, bundle: SnapshotBundle): void {
  const insertFund = db.prepare(`
    INSERT OR REPLACE INTO funds (
      code, name, fund_type, venue, fund_company, tracking_target_code, share_class, parent_fund_code, enabled
    ) VALUES (
      @code, @name, @fundType, @venue, @fundCompany, @trackingTargetCode, @shareClass, @parentFundCode, @enabled
    )
  `);
  const disableFundsForTarget = db.prepare("UPDATE funds SET enabled = 0 WHERE tracking_target_code = ?");
  const insertQuote = db.prepare(`
    INSERT OR REPLACE INTO fund_quotes (
      fund_code, close_price, closing_premium_discount_rate, turnover, trade_date, source, sync_run_id
    ) VALUES (
      @fundCode, @closePrice, @closingPremiumDiscountRate, @turnover, @tradeDate, @source, @syncRunId
    )
  `);
  const insertLimit = db.prepare(`
    INSERT OR REPLACE INTO purchase_limits (
      fund_code, share_class, status, limit_amount_yuan, limit_unit, channel_scope, source, data_date, confidence, sync_run_id
    ) VALUES (
      @fundCode, @shareClass, @status, @limitAmountYuan, @limitUnit, @channelScope, @source, @dataDate, @confidence, @syncRunId
    )
  `);
  const insertFee = db.prepare(`
    INSERT INTO fund_fees (
      fund_code, fee_type, rate, min_holding_days, max_holding_days, amount_tier_lower_bound,
      amount_tier_upper_bound, channel_scope, source, data_date, sync_run_id
    ) VALUES (
      @fundCode, @feeType, @rate, @minHoldingDays, @maxHoldingDays, @amountTierLowerBound,
      @amountTierUpperBound, @channelScope, @source, @dataDate, @syncRunId
    )
  `);
  const deleteFeeSnapshot = db.prepare("DELETE FROM fund_fees WHERE fund_code = ? AND source = ? AND data_date = ?");

  const tx = db.transaction(() => {
    for (const targetCode of uniqueSnapshotTargets(bundle.funds)) {
      disableFundsForTarget.run(targetCode);
    }
    for (const fund of bundle.funds) {
      insertFund.run({
        ...fund,
        fundCompany: fund.fundCompany ?? null,
        trackingTargetCode: fund.trackingTargetCode ?? null,
        parentFundCode: fund.parentFundCode ?? null,
        enabled: fund.enabled ? 1 : 0
      });
    }
    for (const quote of bundle.quotes) insertQuote.run(quote);
    for (const limit of bundle.limits) {
      insertLimit.run({
        ...limit,
        limitAmountYuan: limit.limitAmountYuan ?? null,
        limitUnit: limit.limitUnit ?? null
      });
    }
    for (const key of uniqueFeeSnapshotKeys(bundle.fees)) {
      deleteFeeSnapshot.run(key.fundCode, key.source, key.dataDate);
    }
    for (const fee of bundle.fees) {
      insertFee.run({
        ...fee,
        minHoldingDays: fee.minHoldingDays ?? null,
        maxHoldingDays: fee.maxHoldingDays ?? null,
        amountTierLowerBound: fee.amountTierLowerBound ?? null,
        amountTierUpperBound: fee.amountTierUpperBound ?? null
      });
    }
  });

  tx();
}

function uniqueFeeSnapshotKeys(fees: FeeTier[]): Array<{ fundCode: string; source: string; dataDate: string }> {
  const keys = new Map<string, { fundCode: string; source: string; dataDate: string }>();
  for (const fee of fees) {
    const key = `${fee.fundCode}|${fee.source}|${fee.dataDate}`;
    keys.set(key, { fundCode: fee.fundCode, source: fee.source, dataDate: fee.dataDate });
  }
  return [...keys.values()];
}

function uniqueSnapshotTargets(funds: Fund[]): string[] {
  return [...new Set(funds.flatMap((fund) => (fund.trackingTargetCode ? [fund.trackingTargetCode] : [])))];
}

export function queryIndexComparison(db: Database.Database, targetCode: string): { onExchange: IndexComparisonRow[]; offExchange: IndexComparisonRow[] } {
  const rows = db.prepare(`
    SELECT
      f.code,
      f.name,
      f.venue,
      f.share_class AS shareClass,
      q.close_price AS closePrice,
      q.closing_premium_discount_rate AS closingPremiumDiscountRate,
      q.turnover,
      q.trade_date AS tradeDate,
      COALESCE(q.source, l.source) AS source,
      l.status,
      l.limit_amount_yuan AS limitAmountYuan,
      l.channel_scope AS channelScope
    FROM funds f
    LEFT JOIN fund_quotes q ON q.rowid = (
      SELECT q2.rowid
      FROM fund_quotes q2
      WHERE q2.fund_code = f.code
      ORDER BY q2.trade_date DESC,
        CASE q2.source WHEN 'eastmoney' THEN 0 ELSE 1 END
      LIMIT 1
    )
    LEFT JOIN purchase_limits l ON l.rowid = (
      SELECT l2.rowid
      FROM purchase_limits l2
      WHERE l2.fund_code = f.code
      ORDER BY l2.data_date DESC,
        CASE l2.source WHEN 'tiantian-f10-jjfl' THEN 0 WHEN 'tiantian' THEN 1 ELSE 2 END,
        l2.confidence DESC
      LIMIT 1
    )
    WHERE f.tracking_target_code = ? AND f.enabled = 1
  `).all(targetCode) as IndexComparisonRow[];

  return {
    onExchange: rows.filter((row) => row.venue === "on_exchange"),
    offExchange: rows.filter((row) => row.venue === "off_exchange")
  };
}
