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

  const tx = db.transaction(() => {
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
  });

  tx();
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
    LEFT JOIN fund_quotes q ON q.fund_code = f.code
    LEFT JOIN purchase_limits l ON l.fund_code = f.code
    WHERE f.tracking_target_code = ? AND f.enabled = 1
  `).all(targetCode) as IndexComparisonRow[];

  return {
    onExchange: rows.filter((row) => row.venue === "on_exchange"),
    offExchange: rows.filter((row) => row.venue === "off_exchange")
  };
}
