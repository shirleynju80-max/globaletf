import type Database from "better-sqlite3";
import { formatPercent } from "../domain/fees";
import { matchesStockTarget } from "../domain/holdings";
import type { FeeTier, FeeType, Fund, FundHolding, FundQuote, PurchaseLimit } from "../domain/types";

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
  limitUnit?: string | null;
  limitDataDate?: string | null;
  feeDataDate?: string | null;
  channelScope?: string;
  source?: string;
  defaultSubscriptionRate?: number | null;
  managementRate?: number | null;
  custodianRate?: number | null;
  salesServiceRate?: number | null;
  redemptionFeeSummary?: string | null;
}

interface FeeRow {
  fundCode: string;
  feeType: FeeType;
  rate: number;
  minHoldingDays: number | null;
  maxHoldingDays: number | null;
  amountTierLowerBound: number | null;
  amountTierUpperBound: number | null;
  source: string;
  dataDate: string;
}

export interface StockConcentrationRow {
  fundCode: string;
  fundName: string;
  venue: "on_exchange" | "off_exchange";
  shareClass: string;
  stockCode: string;
  stockName: string;
  navPercent: number;
  holdingMarketValue?: number | null;
  reportPeriod: string;
  source: string;
  purchaseStatus?: string | null;
  limitAmountYuan?: number | null;
  limitUnit?: string | null;
  limitDataDate?: string | null;
}

export type SyncStatusArea = "fund" | "quote" | "purchaseLimit" | "fee" | "holding";
export type SyncStatusValue = "ok" | "fallback" | "error";

export interface SyncStatusRow {
  area: SyncStatusArea;
  status: SyncStatusValue;
  source: string | null;
  dataDate: string | null;
  itemCount: number;
  freshItemCount?: number | null;
  cachedItemCount?: number | null;
  durationMs?: number | null;
  errorCategory?: string | null;
  message?: string | null;
  updatedAt: string;
}

export type SyncStatusMap = Partial<Record<SyncStatusArea, SyncStatusRow>>;

export interface SyncRunRow {
  syncRunId: string;
  status: "completed" | "failed";
  startedAt: string;
  completedAt?: string | null;
}

export interface ProviderResultRow {
  syncRunId: string;
  area: string;
  attemptOrder: number;
  providerName: string;
  ok: boolean;
  dataDate?: string | null;
  errorCategory?: string | null;
  message?: string | null;
  rawPayloadHash?: string | null;
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
  const insertHolding = db.prepare(`
    INSERT OR REPLACE INTO fund_holdings (
      fund_code, stock_code, stock_name, nav_percent, holding_market_value, report_period, source, sync_run_id
    ) VALUES (
      @fundCode, @stockCode, @stockName, @navPercent, @holdingMarketValue, @reportPeriod, @source, @syncRunId
    )
  `);

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
    for (const holding of bundle.holdings) {
      insertHolding.run({
        ...holding,
        holdingMarketValue: holding.holdingMarketValue ?? null
      });
    }
  });

  tx();
}

export function recordSyncStatus(db: Database.Database, status: SyncStatusRow): void {
  db.prepare(`
    INSERT OR REPLACE INTO sync_status (
      area, status, source, data_date, item_count, fresh_item_count, cached_item_count, duration_ms, error_category, message, updated_at
    ) VALUES (
      @area, @status, @source, @dataDate, @itemCount, @freshItemCount, @cachedItemCount, @durationMs, @errorCategory, @message, @updatedAt
    )
  `).run({
    ...status,
    freshItemCount: status.freshItemCount ?? null,
    cachedItemCount: status.cachedItemCount ?? null,
    durationMs: status.durationMs ?? null,
    errorCategory: status.errorCategory ?? null,
    message: status.message ?? null
  });
}

export function recordSyncRun(db: Database.Database, row: SyncRunRow): void {
  db.prepare(`
    INSERT OR REPLACE INTO sync_runs (
      sync_run_id, status, started_at, completed_at
    ) VALUES (
      @syncRunId, @status, @startedAt, @completedAt
    )
  `).run({
    ...row,
    completedAt: row.completedAt ?? null
  });
}

export function recordProviderResults(db: Database.Database, rows: ProviderResultRow[]): void {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO provider_results (
      sync_run_id, area, attempt_order, provider_name, ok, data_date, error_category, message, raw_payload_hash
    ) VALUES (
      @syncRunId, @area, @attemptOrder, @providerName, @ok, @dataDate, @errorCategory, @message, @rawPayloadHash
    )
  `);
  const tx = db.transaction(() => {
    for (const row of rows) {
      insert.run({
        ...row,
        ok: row.ok ? 1 : 0,
        dataDate: row.dataDate ?? null,
        errorCategory: row.errorCategory ?? null,
        message: row.message ?? null,
        rawPayloadHash: row.rawPayloadHash ?? null
      });
    }
  });

  tx();
}

export function querySyncStatus(db: Database.Database): SyncStatusMap {
  const rows = db.prepare(`
    SELECT
      area,
      status,
      source,
      data_date AS dataDate,
      item_count AS itemCount,
      fresh_item_count AS freshItemCount,
      cached_item_count AS cachedItemCount,
      duration_ms AS durationMs,
      error_category AS errorCategory,
      message,
      updated_at AS updatedAt
    FROM sync_status
  `).all() as SyncStatusRow[];

  return Object.fromEntries(rows.map((row) => [row.area, row])) as SyncStatusMap;
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
      l.limit_unit AS limitUnit,
      l.data_date AS limitDataDate,
      l.channel_scope AS channelScope
    FROM funds f
    LEFT JOIN fund_quotes q ON q.rowid = (
      SELECT q2.rowid
      FROM fund_quotes q2
      WHERE q2.fund_code = f.code
      ORDER BY q2.trade_date DESC,
        CASE q2.source WHEN 'eastmoney-on-exchange-quote' THEN 0 WHEN 'eastmoney' THEN 1 ELSE 2 END
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
  enrichRowsWithFees(db, rows);

  return {
    onExchange: rows.filter((row) => row.venue === "on_exchange").sort(compareOnExchangeRows),
    offExchange: rows.filter((row) => row.venue === "off_exchange").sort(compareOffExchangeRows)
  };
}

function compareOnExchangeRows(a: IndexComparisonRow, b: IndexComparisonRow): number {
  const turnoverDiff = (b.turnover ?? -1) - (a.turnover ?? -1);
  if (turnoverDiff !== 0) return turnoverDiff;
  return a.code.localeCompare(b.code);
}

function compareOffExchangeRows(a: IndexComparisonRow, b: IndexComparisonRow): number {
  const capacityRankDiff = purchaseCapacityRank(a) - purchaseCapacityRank(b);
  if (capacityRankDiff !== 0) return capacityRankDiff;
  const limitDiff = (b.limitAmountYuan ?? -1) - (a.limitAmountYuan ?? -1);
  if (limitDiff !== 0) return limitDiff;
  const visibleCostDiff = visibleFeeCost(a) - visibleFeeCost(b);
  if (Number.isFinite(visibleCostDiff) && visibleCostDiff !== 0) return visibleCostDiff;
  return a.code.localeCompare(b.code);
}

function purchaseCapacityRank(row: IndexComparisonRow): number {
  if (row.status === "open") return 0;
  if (row.limitAmountYuan != null) return 1;
  return 2;
}

function visibleFeeCost(row: IndexComparisonRow): number {
  const rates: Array<number | null | undefined> = [row.defaultSubscriptionRate, row.managementRate, row.custodianRate, row.salesServiceRate];
  if (rates.every((rate) => rate == null)) return Number.POSITIVE_INFINITY;
  return rates.reduce<number>((sum, rate) => sum + (rate ?? 0), 0);
}

export function queryStockConcentration(db: Database.Database, stockCode: string): StockConcentrationRow[] {
  const rows = db.prepare(`
    SELECT
      h.fund_code AS fundCode,
      f.name AS fundName,
      f.venue,
      f.share_class AS shareClass,
      h.stock_code AS stockCode,
      h.stock_name AS stockName,
      h.nav_percent AS navPercent,
      h.holding_market_value AS holdingMarketValue,
      h.report_period AS reportPeriod,
      h.source,
      l.status AS purchaseStatus,
      l.limit_amount_yuan AS limitAmountYuan,
      l.limit_unit AS limitUnit,
      l.data_date AS limitDataDate
    FROM fund_holdings h
    JOIN funds f ON f.code = h.fund_code
    LEFT JOIN purchase_limits l ON l.rowid = (
      SELECT l2.rowid
      FROM purchase_limits l2
      WHERE l2.fund_code = f.code
      ORDER BY l2.data_date DESC,
        CASE l2.source WHEN 'tiantian-f10-jjfl' THEN 0 WHEN 'tiantian' THEN 1 ELSE 2 END,
        l2.confidence DESC
      LIMIT 1
    )
    WHERE f.enabled = 1
  `).all() as StockConcentrationRow[];

  const matchingRows = rows.filter((row) =>
    matchesStockTarget({ targetCode: stockCode, stockCode: row.stockCode, stockName: row.stockName })
  );
  const latestReportPeriod = matchingRows.map((row) => row.reportPeriod).sort().at(-1);
  if (!latestReportPeriod) return [];

  return matchingRows
    .filter((row) => row.reportPeriod === latestReportPeriod)
    .sort((a, b) => b.navPercent - a.navPercent);
}

function enrichRowsWithFees(db: Database.Database, rows: IndexComparisonRow[]): void {
  const fundCodes = rows.filter((row) => row.venue === "off_exchange").map((row) => row.code);
  if (fundCodes.length === 0) return;

  const placeholders = fundCodes.map(() => "?").join(",");
  const fees = db.prepare(`
    SELECT
      fund_code AS fundCode,
      fee_type AS feeType,
      rate,
      min_holding_days AS minHoldingDays,
      max_holding_days AS maxHoldingDays,
      amount_tier_lower_bound AS amountTierLowerBound,
      amount_tier_upper_bound AS amountTierUpperBound,
      source,
      data_date AS dataDate
    FROM fund_fees
    WHERE fund_code IN (${placeholders})
    ORDER BY
      fund_code,
      data_date DESC,
      CASE source WHEN 'tiantian-f10-jjfl' THEN 0 WHEN 'tiantian' THEN 1 ELSE 2 END,
      amount_tier_lower_bound,
      min_holding_days
  `).all(...fundCodes) as FeeRow[];

  const feesByFund = new Map<string, FeeRow[]>();
  for (const fee of fees) {
    const existing = feesByFund.get(fee.fundCode) ?? [];
    existing.push(fee);
    feesByFund.set(fee.fundCode, existing);
  }

  for (const row of rows) {
    if (row.venue !== "off_exchange") continue;
    const fundFees = feesByFund.get(row.code) ?? [];
    row.defaultSubscriptionRate = selectDefaultSubscriptionRate(fundFees);
    row.managementRate = selectSingleRate(fundFees, "management");
    row.custodianRate = selectSingleRate(fundFees, "custodian");
    row.salesServiceRate = selectSingleRate(fundFees, "sales_service");
    row.redemptionFeeSummary = summarizeRedemptionFees(fundFees);
    row.feeDataDate = selectPreferredFeeDataDate(fundFees);
  }
}

function selectDefaultSubscriptionRate(fees: FeeRow[]): number | null {
  return selectPreferredSnapshot(fees, "subscription").sort(
    (a, b) => (a.amountTierLowerBound ?? 0) - (b.amountTierLowerBound ?? 0)
  )[0]?.rate ?? null;
}

function selectSingleRate(fees: FeeRow[], feeType: FeeType): number | null {
  return selectPreferredSnapshot(fees, feeType)[0]?.rate ?? null;
}

function summarizeRedemptionFees(fees: FeeRow[]): string | null {
  const tiers = selectPreferredSnapshot(fees, "redemption").sort(
    (a, b) => (a.minHoldingDays ?? 0) - (b.minHoldingDays ?? 0)
  );
  if (tiers.length === 0) return null;

  return tiers
    .map((tier) => `${formatHoldingRange(tier)}: ${formatPercent(tier.rate)}`)
    .join("; ");
}

function selectPreferredSnapshot(fees: FeeRow[], feeType: FeeType): FeeRow[] {
  const matching = fees.filter((fee) => fee.feeType === feeType);
  const best = matching.sort(compareFeeSnapshot)[0];
  if (!best) return [];

  return matching.filter((fee) => fee.dataDate === best.dataDate && fee.source === best.source);
}

function selectPreferredFeeDataDate(fees: FeeRow[]): string | null {
  return fees.sort(compareFeeSnapshot)[0]?.dataDate ?? null;
}

function compareFeeSnapshot(a: FeeRow, b: FeeRow): number {
  const dateCompare = b.dataDate.localeCompare(a.dataDate);
  if (dateCompare !== 0) return dateCompare;
  return sourcePriority(a.source) - sourcePriority(b.source);
}

function sourcePriority(source: string): number {
  if (source === "tiantian-f10-jjfl") return 0;
  if (source === "tiantian") return 1;
  return 2;
}

function formatHoldingRange(tier: FeeRow): string {
  const min = tier.minHoldingDays ?? 0;
  if (tier.maxHoldingDays == null) return `${min}天以上`;
  return `${min}-${tier.maxHoldingDays}天`;
}
