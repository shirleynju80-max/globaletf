import type Database from "better-sqlite3";
import { formatPercent } from "../domain/fees";
import { isDelistedOnExchange } from "../domain/delistedOnExchange";
import { matchesStockTarget } from "../domain/holdings";
import { dedupeStockConcentrationRows } from "../domain/stockConcentrationDedup";
import { buildStockFundIndexRows, lookupStockKey, stockIndexLookupKeys } from "../domain/stockHoldingIndex";
import { STOCK_TARGETS } from "../domain/targets";
import type { FundSearchRow } from "../providers/eastmoneyFundSearch";
import { reconcilePurchaseLimit } from "../domain/purchaseLimitReconciliation";
import type { FeeTier, FeeType, Fund, FundHolding, FundQuote, PurchaseLimit, ShareClass } from "../domain/types";

export interface SnapshotBundle {
  syncRunId: string;
  funds: Fund[];
  quotes: FundQuote[];
  limits: PurchaseLimit[];
  fees: FeeTier[];
  holdings: FundHolding[];
}

export interface IndexComparisonRow {
  code: string;
  name: string;
  venue: "on_exchange" | "off_exchange";
  shareClass: string;
  closePrice?: number;
  closingPremiumDiscountRate: number | null;
  unitNav?: number | null;
  navDate?: string | null;
  iopv?: number | null;
  iopvTime?: string | null;
  iopvPremiumDiscountRate?: number | null;
  turnover?: number;
  tradeDate?: string;
  status?: string;
  limitAmountYuan?: number;
  limitUnit?: string | null;
  limitDataDate?: string | null;
  limitEffectiveDate?: string | null;
  limitSyncedAt?: string | null;
  limitStatusConflict?: boolean;
  limitStale?: boolean;
  feeDataDate?: string | null;
  channelScope?: string;
  channelId?: string;
  source?: string;
  defaultSubscriptionRate?: number | null;
  managementRate?: number | null;
  custodianRate?: number | null;
  salesServiceRate?: number | null;
  redemptionFeeSummary?: string | null;
  discoverySource?: string | null;
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
  trackingTargetCode?: string | null;
  parentFundCode?: string | null;
  purchaseStatus?: string | null;
  limitAmountYuan?: number | null;
  limitUnit?: string | null;
  limitDataDate?: string | null;
  limitEffectiveDate?: string | null;
  limitSyncedAt?: string | null;
  limitStatusConflict?: boolean;
  limitStale?: boolean;
  fundKind?: string;
}

export interface StockConcentrationMeta {
  reportPeriod: string | null;
  dataSource: "stock_fund_index" | "fund_holdings";
  totalBeforeDedupe: number;
  collapsedIndexPeers: number;
}

export interface StockConcentrationResult {
  rows: StockConcentrationRow[];
  meta: StockConcentrationMeta;
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
  confidence?: number | null;
  fetchedAt?: string | null;
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
      fund_code, close_price, closing_premium_discount_rate, unit_nav, nav_date,
      iopv, iopv_time, iopv_premium_discount_rate, price_time, iopv_aligned, turnover, trade_date, source, sync_run_id
    ) VALUES (
      @fundCode, @closePrice, @closingPremiumDiscountRate, @unitNav, @navDate,
      @iopv, @iopvTime, @iopvPremiumDiscountRate, @priceTime, @iopvAligned, @turnover, @tradeDate, @source, @syncRunId
    )
  `);
  const insertLimit = db.prepare(`
    INSERT OR REPLACE INTO purchase_limits (
      fund_code, share_class, status, limit_amount_yuan, limit_unit, channel_scope, channel_id, source, data_date, confidence, sync_run_id
    ) VALUES (
      @fundCode, @shareClass, @status, @limitAmountYuan, @limitUnit, @channelScope, @channelId, @source, @dataDate, @confidence, @syncRunId
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
  const deleteSupersededSpotQuote = db.prepare(`
    DELETE FROM fund_quotes
    WHERE fund_code = ? AND trade_date = ? AND source = 'eastmoney-on-exchange-spot'
  `);
  const deleteStaleF10DirectLimits = db.prepare(`
    DELETE FROM purchase_limits
    WHERE channel_scope = 'direct' AND source = 'tiantian-f10-jjfl'
  `);
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
    for (const quote of bundle.quotes) {
      if (quote.source === "eastmoney-on-exchange-quote") {
        deleteSupersededSpotQuote.run(quote.fundCode, quote.tradeDate);
      }
      insertQuote.run({
        ...quote,
        unitNav: quote.unitNav ?? null,
        navDate: quote.navDate ?? null,
        iopv: quote.iopv ?? null,
        iopvTime: quote.iopvTime ?? null,
        iopvPremiumDiscountRate: quote.iopvPremiumDiscountRate ?? null,
        priceTime: quote.priceTime ?? null,
        iopvAligned: quote.iopvAligned == null ? null : quote.iopvAligned ? 1 : 0,
        turnover: quote.turnover ?? null
      });
    }
    if (bundle.limits.length > 0) {
      deleteStaleF10DirectLimits.run();
    }
    for (const limit of bundle.limits) {
      insertLimit.run({
        ...limit,
        limitAmountYuan: limit.limitAmountYuan ?? null,
        limitUnit: limit.limitUnit ?? null,
        channelId: limit.channelId ?? "aggregate"
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
      sync_run_id, area, attempt_order, provider_name, ok, confidence, fetched_at, data_date, error_category, message, raw_payload_hash
    ) VALUES (
      @syncRunId, @area, @attemptOrder, @providerName, @ok, @confidence, @fetchedAt, @dataDate, @errorCategory, @message, @rawPayloadHash
    )
  `);
  const tx = db.transaction(() => {
    for (const row of rows) {
      insert.run({
        ...row,
        ok: row.ok ? 1 : 0,
        confidence: row.confidence ?? null,
        fetchedAt: row.fetchedAt ?? null,
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

export function queryOnExchangeFundCodes(db: Database.Database, targetCode: string): Array<{ code: string; name: string }> {
  const rows = db.prepare(`
    SELECT code, name
    FROM funds
    WHERE tracking_target_code = ? AND venue = 'on_exchange' AND enabled = 1
    ORDER BY code
  `).all(targetCode) as Array<{ code: string; name: string }>;
  return rows.filter((row) => !isDelistedOnExchange(row.code));
}

export type IndexComparisonResult = {
  onExchange: IndexComparisonRow[];
  offExchange: IndexComparisonRow[];
};

export function queryIndexComparison(db: Database.Database, targetCode: string): IndexComparisonResult {
  const rows = db.prepare(`
    SELECT
      f.code,
      f.name,
      f.venue,
      f.share_class AS shareClass,
      q.close_price AS closePrice,
      q.closing_premium_discount_rate AS closingPremiumDiscountRate,
      q.unit_nav AS unitNav,
      q.nav_date AS navDate,
      COALESCE(q.iopv, q_iopv.iopv) AS iopv,
      COALESCE(q.iopv_time, q_iopv.iopv_time) AS iopvTime,
      COALESCE(q.iopv_premium_discount_rate, q_iopv.iopv_premium_discount_rate) AS iopvPremiumDiscountRate,
      q.turnover,
      q.trade_date AS tradeDate,
      q.source,
      m.discovery_source AS discoverySource
    FROM funds f
    LEFT JOIN fund_discovery_manifest m ON m.fund_code = f.code
    LEFT JOIN fund_quotes q ON q.rowid = (
      SELECT q2.rowid
      FROM fund_quotes q2
      WHERE q2.fund_code = f.code
      ORDER BY q2.trade_date DESC,
        CASE q2.source WHEN 'eastmoney-on-exchange-quote' THEN 0 WHEN 'eastmoney' THEN 1 ELSE 2 END
      LIMIT 1
    )
    LEFT JOIN fund_quotes q_iopv ON q_iopv.rowid = (
      SELECT q3.rowid
      FROM fund_quotes q3
      WHERE q3.fund_code = f.code
        AND q.trade_date IS NOT NULL
        AND q3.trade_date = q.trade_date
        AND q3.iopv_premium_discount_rate IS NOT NULL
      ORDER BY CASE q3.source WHEN 'eastmoney-on-exchange-spot' THEN 0 WHEN 'eastmoney-on-exchange-quote' THEN 1 ELSE 2 END
      LIMIT 1
    )
    WHERE f.tracking_target_code = ? AND f.enabled = 1
  `).all(targetCode) as IndexComparisonRow[];
  enrichOffExchangePurchaseLimits(db, rows);
  enrichRowsWithFees(db, rows);

  return {
    onExchange: rows.filter((row) => row.venue === "on_exchange" && !isDelistedOnExchange(row.code)).sort(compareOnExchangeRows),
    offExchange: rows.filter((row) => row.venue === "off_exchange").sort(compareOffExchangeRows)
  };
}

function compareOnExchangeRows(a: IndexComparisonRow, b: IndexComparisonRow): number {
  const rateA = a.iopvPremiumDiscountRate;
  const rateB = b.iopvPremiumDiscountRate;
  if (rateA == null && rateB == null) return a.code.localeCompare(b.code);
  if (rateA == null) return 1;
  if (rateB == null) return -1;
  const diff = rateB - rateA;
  if (diff !== 0) return diff;
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
  if (row.status === "suspended") return 3;
  if (row.status === "open") return 0;
  if (row.limitAmountYuan != null) return 1;
  return 2;
}

function visibleFeeCost(row: IndexComparisonRow): number {
  const rates: Array<number | null | undefined> = [row.defaultSubscriptionRate, row.managementRate, row.custodianRate, row.salesServiceRate];
  if (rates.every((rate) => rate == null)) return Number.POSITIVE_INFINITY;
  return rates.reduce<number>((sum, rate) => sum + (rate ?? 0), 0);
}

export function queryCachedHoldingsByFundCode(db: Database.Database, fundCodes: string[]): Map<string, FundHolding[]> {
  if (fundCodes.length === 0) return new Map();
  const placeholders = fundCodes.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT
      fund_code AS fundCode,
      stock_code AS stockCode,
      stock_name AS stockName,
      nav_percent AS navPercent,
      holding_market_value AS holdingMarketValue,
      report_period AS reportPeriod,
      source,
      sync_run_id AS syncRunId
    FROM fund_holdings
    WHERE fund_code IN (${placeholders})
  `).all(...fundCodes) as FundHolding[];

  const latestPeriodByFund = new Map<string, string>();
  for (const row of rows) {
    const current = latestPeriodByFund.get(row.fundCode);
    if (!current || row.reportPeriod > current) {
      latestPeriodByFund.set(row.fundCode, row.reportPeriod);
    }
  }

  const grouped = new Map<string, FundHolding[]>();
  for (const row of rows) {
    if (row.reportPeriod !== latestPeriodByFund.get(row.fundCode)) continue;
    const bucket = grouped.get(row.fundCode) ?? [];
    bucket.push(row);
    grouped.set(row.fundCode, bucket);
  }
  return grouped;
}

export function queryStockConcentration(
  db: Database.Database,
  stockCode: string,
  options: { dedupe?: boolean } = {}
): StockConcentrationResult {
  const stockKey = lookupStockKey(stockCode);
  const indexExists = db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'stock_fund_index'
  `).get();

  let rows: StockConcentrationRow[];
  let dataSource: StockConcentrationMeta["dataSource"] = "fund_holdings";
  if (indexExists) {
    rows = queryStockConcentrationFromIndex(db, stockKey);
    if (rows.length > 0) {
      dataSource = "stock_fund_index";
    } else {
      rows = queryStockConcentrationFromRawHoldings(db, stockKey);
    }
  } else {
    rows = queryStockConcentrationFromRawHoldings(db, stockKey);
  }

  enrichStockConcentrationPurchaseLimits(db, rows);

  const latestReportPeriod = rows.map((row) => row.reportPeriod).sort().at(-1) ?? null;
  if (!latestReportPeriod) {
    return {
      rows: [],
      meta: {
        reportPeriod: null,
        dataSource,
        totalBeforeDedupe: 0,
        collapsedIndexPeers: 0
      }
    };
  }

  const sorted = rows
    .filter((row) => row.reportPeriod === latestReportPeriod)
    .map((row) => ({
      ...row,
      fundKind: formatStockConcentrationFundKind(row.trackingTargetCode)
    }))
    .sort((a, b) => b.navPercent - a.navPercent);

  const totalBeforeDedupe = sorted.length;
  if (options.dedupe === false) {
    return {
      rows: sorted,
      meta: {
        reportPeriod: latestReportPeriod,
        dataSource,
        totalBeforeDedupe,
        collapsedIndexPeers: 0
      }
    };
  }

  const metaByFundCode = new Map(
    sorted.map((row) => [row.fundCode, {
      trackingTargetCode: row.trackingTargetCode,
      parentFundCode: row.parentFundCode,
      fundName: row.fundName
    }])
  );
  const deduped = dedupeStockConcentrationRows(sorted, metaByFundCode);
  return {
    rows: deduped,
    meta: {
      reportPeriod: latestReportPeriod,
      dataSource,
      totalBeforeDedupe,
      collapsedIndexPeers: Math.max(0, totalBeforeDedupe - deduped.length)
    }
  };
}

function formatStockConcentrationFundKind(trackingTargetCode?: string | null): string {
  if (!trackingTargetCode) return "主动/QDII";
  const labels: Record<string, string> = {
    NASDAQ_100: "纳指100",
    SP_500: "标普500",
    NIKKEI_225: "日经225",
    HSTECH: "恒生科技",
    KOSPI: "韩国综合"
  };
  return labels[trackingTargetCode] ?? trackingTargetCode;
}

function queryStockConcentrationFromIndex(db: Database.Database, stockKey: string): StockConcentrationRow[] {
  const lookupKeys = stockIndexLookupKeys(stockKey);
  const placeholders = lookupKeys.map(() => "?").join(", ");
  return db.prepare(`
    SELECT
      sfi.fund_code AS fundCode,
      f.name AS fundName,
      f.venue,
      f.share_class AS shareClass,
      f.tracking_target_code AS trackingTargetCode,
      f.parent_fund_code AS parentFundCode,
      sfi.stock_code AS stockCode,
      sfi.stock_name AS stockName,
      sfi.nav_percent AS navPercent,
      sfi.holding_market_value AS holdingMarketValue,
      sfi.report_period AS reportPeriod,
      sfi.source
    FROM stock_fund_index sfi
    JOIN funds f ON f.code = sfi.fund_code
    WHERE sfi.stock_key IN (${placeholders})
      AND f.enabled = 1
  `).all(...lookupKeys) as StockConcentrationRow[];
}

function queryStockConcentrationFromRawHoldings(db: Database.Database, targetCode: string): StockConcentrationRow[] {
  const rows = db.prepare(`
    SELECT
      h.fund_code AS fundCode,
      f.name AS fundName,
      f.venue,
      f.share_class AS shareClass,
      f.tracking_target_code AS trackingTargetCode,
      f.parent_fund_code AS parentFundCode,
      h.stock_code AS stockCode,
      h.stock_name AS stockName,
      h.nav_percent AS navPercent,
      h.holding_market_value AS holdingMarketValue,
      h.report_period AS reportPeriod,
      h.source
    FROM fund_holdings h
    JOIN funds f ON f.code = h.fund_code
    WHERE f.enabled = 1
  `).all() as StockConcentrationRow[];

  return rows.filter((row) =>
    matchesStockTarget({ targetCode, stockCode: row.stockCode, stockName: row.stockName })
  );
}

function enrichOffExchangePurchaseLimits(db: Database.Database, rows: IndexComparisonRow[]): void {
  const offExchangeRows = rows.filter((row) => row.venue === "off_exchange");
  if (offExchangeRows.length === 0) return;

  const limitsByFund = loadPurchaseLimitsByFund(
    db,
    offExchangeRows.map((row) => row.code)
  );
  for (const row of offExchangeRows) {
    applyReconciledPurchaseLimit(row, reconcilePurchaseLimit(row.shareClass as ShareClass, limitsByFund.get(row.code) ?? []));
  }
}

function enrichStockConcentrationPurchaseLimits(db: Database.Database, rows: StockConcentrationRow[]): void {
  if (rows.length === 0) return;

  const limitsByFund = loadPurchaseLimitsByFund(db, rows.map((row) => row.fundCode));
  for (const row of rows) {
    const limits = limitsByFund.get(row.fundCode);
    if (!limits?.length) continue;
    const reconciled = reconcilePurchaseLimit(row.shareClass as ShareClass, limits);
    row.purchaseStatus = reconciled.status;
    row.limitAmountYuan = reconciled.limitAmountYuan;
    row.limitUnit = reconciled.limitUnit;
    row.limitDataDate = reconciled.limitEffectiveDate;
    row.limitEffectiveDate = reconciled.limitEffectiveDate;
    row.limitSyncedAt = reconciled.limitSyncedAt;
    row.limitStatusConflict = reconciled.statusConflict;
    row.limitStale = reconciled.limitStale;
  }
}

function loadPurchaseLimitsByFund(db: Database.Database, fundCodes: string[]): Map<string, PurchaseLimit[]> {
  if (fundCodes.length === 0) return new Map();

  const placeholders = fundCodes.map(() => "?").join(",");
  const limits = db.prepare(`
    SELECT
      fund_code AS fundCode,
      share_class AS shareClass,
      status,
      limit_amount_yuan AS limitAmountYuan,
      limit_unit AS limitUnit,
      channel_scope AS channelScope,
      channel_id AS channelId,
      source,
      data_date AS dataDate,
      confidence,
      sync_run_id AS syncRunId
    FROM purchase_limits
    WHERE fund_code IN (${placeholders})
  `).all(...fundCodes) as PurchaseLimit[];

  const grouped = new Map<string, PurchaseLimit[]>();
  for (const limit of limits) {
    const existing = grouped.get(limit.fundCode) ?? [];
    existing.push(limit);
    grouped.set(limit.fundCode, existing);
  }
  return grouped;
}

function applyReconciledPurchaseLimit(
  row: IndexComparisonRow,
  reconciled: ReturnType<typeof reconcilePurchaseLimit>
): void {
  row.status = reconciled.status;
  row.limitAmountYuan = reconciled.limitAmountYuan;
  row.limitUnit = reconciled.limitUnit;
  row.limitDataDate = reconciled.limitEffectiveDate;
  row.limitEffectiveDate = reconciled.limitEffectiveDate;
  row.limitSyncedAt = reconciled.limitSyncedAt;
  row.limitStatusConflict = reconciled.statusConflict;
  row.limitStale = reconciled.limitStale;
  row.channelScope = reconciled.channelScope;
  row.channelId = reconciled.channelId;
  row.source = reconciled.source;
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
    .map((tier) => `${formatHoldingRange(tier)}: ${formatPercent(tier.rate, 1)}`)
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

export interface FundDiscoveryManifestRow {
  fundCode: string;
  trackingTargetCode: string;
  venue: Fund["venue"];
  shareClass: Fund["shareClass"];
  discoverySource: string;
  syncRunId: string;
  updatedAt: string;
}

export function replaceFundDiscoveryManifest(db: Database.Database, syncRunId: string, funds: Fund[], updatedAt: string): void {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO fund_discovery_manifest (
      fund_code, tracking_target_code, venue, share_class, discovery_source, sync_run_id, updated_at
    ) VALUES (
      @fundCode, @trackingTargetCode, @venue, @shareClass, @discoverySource, @syncRunId, @updatedAt
    )
  `);
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM fund_discovery_manifest").run();
    for (const fund of funds) {
      if (!fund.enabled || !fund.trackingTargetCode) continue;
      insert.run({
        fundCode: fund.code,
        trackingTargetCode: fund.trackingTargetCode,
        venue: fund.venue,
        shareClass: fund.shareClass,
        discoverySource: fund.discoverySource ?? "catalog-seed",
        syncRunId,
        updatedAt
      });
    }
  });
  tx();
}

export interface DiscoveryProfileGapRow {
  targetCode: string;
  fundCode: string;
  venue: Fund["venue"];
  syncRunId: string;
  updatedAt: string;
}

export function replaceDiscoveryProfileGaps(
  db: Database.Database,
  syncRunId: string,
  gaps: Array<{ targetCode: string; fundCode: string; venue: Fund["venue"] }>,
  updatedAt: string
): void {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO discovery_profile_gaps (
      target_code, fund_code, venue, sync_run_id, updated_at
    ) VALUES (
      @targetCode, @fundCode, @venue, @syncRunId, @updatedAt
    )
  `);
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM discovery_profile_gaps").run();
    for (const gap of gaps) {
      insert.run({ ...gap, syncRunId, updatedAt });
    }
  });
  tx();
}

export function queryDiscoveryProfileGaps(db: Database.Database, targetCode?: string): DiscoveryProfileGapRow[] {
  if (targetCode) {
    return db.prepare(`
      SELECT
        target_code AS targetCode,
        fund_code AS fundCode,
        venue,
        sync_run_id AS syncRunId,
        updated_at AS updatedAt
      FROM discovery_profile_gaps
      WHERE target_code = ?
      ORDER BY fund_code
    `).all(targetCode) as DiscoveryProfileGapRow[];
  }
  return db.prepare(`
    SELECT
      target_code AS targetCode,
      fund_code AS fundCode,
      venue,
      sync_run_id AS syncRunId,
      updated_at AS updatedAt
    FROM discovery_profile_gaps
    ORDER BY target_code, fund_code
  `).all() as DiscoveryProfileGapRow[];
}

/** Alias used by sync runner; replaces the full manifest each sync. */
export const recordFundDiscoveryManifest = replaceFundDiscoveryManifest;

export function queryFundDiscoveryManifest(db: Database.Database): FundDiscoveryManifestRow[] {
  return db.prepare(`
    SELECT
      fund_code AS fundCode,
      tracking_target_code AS trackingTargetCode,
      venue,
      share_class AS shareClass,
      discovery_source AS discoverySource,
      sync_run_id AS syncRunId,
      updated_at AS updatedAt
    FROM fund_discovery_manifest
    ORDER BY tracking_target_code, fund_code
  `).all() as FundDiscoveryManifestRow[];
}

export interface DiscoveryHealthSummary {
  targetCode: string;
  manifestCount: number;
  onExchangeCount: number;
  profileBackedOnExchange: number;
  profileGaps: DiscoveryProfileGapRow[];
  coverageGaps: string[];
}

export function queryDiscoveryHealthForTarget(db: Database.Database, targetCode: string): DiscoveryHealthSummary {
  const manifest = queryFundDiscoveryManifest(db).filter((row) => row.trackingTargetCode === targetCode);
  const onExchange = manifest.filter((row) => row.venue === "on_exchange" && (row.shareClass === "ETF" || row.shareClass === "LOF"));
  const profileBackedOnExchange = onExchange.filter((row) =>
    row.discoverySource === "tracking-profile" ||
    row.discoverySource === "screener-name" ||
    row.discoverySource === "fund-family"
  ).length;

  return {
    targetCode,
    manifestCount: manifest.length,
    onExchangeCount: onExchange.length,
    profileBackedOnExchange,
    profileGaps: queryDiscoveryProfileGaps(db, targetCode),
    coverageGaps: queryDiscoveryCoverageGaps(db, targetCode)
  };
}

/** Enabled on-exchange ETFs/LOFs present in funds but missing from the latest discovery manifest. */
export function queryDiscoveryCoverageGaps(db: Database.Database, targetCode: string): string[] {
  const manifestCodes = new Set(
    (db.prepare(`
      SELECT fund_code AS fundCode
      FROM fund_discovery_manifest
      WHERE tracking_target_code = ?
    `).all(targetCode) as Array<{ fundCode: string }>).map((row) => row.fundCode)
  );
  if (manifestCodes.size === 0) return [];

  const enabled = db.prepare(`
    SELECT code
    FROM funds
    WHERE enabled = 1
      AND tracking_target_code = ?
      AND venue = 'on_exchange'
      AND share_class IN ('ETF', 'LOF')
  `).all(targetCode) as Array<{ code: string }>;

  return enabled.map((row) => row.code).filter((code) => !manifestCodes.has(code));
}

/** Manifest on-exchange ETFs not enabled in funds (discovery found but universe dropped). */
export function queryDiscoveryManifestOrphans(db: Database.Database, targetCode: string): string[] {
  return (db.prepare(`
    SELECT m.fund_code AS fundCode
    FROM fund_discovery_manifest m
    LEFT JOIN funds f ON f.code = m.fund_code AND f.enabled = 1
    WHERE m.tracking_target_code = ?
      AND m.venue = 'on_exchange'
      AND m.share_class IN ('ETF', 'LOF')
      AND f.code IS NULL
  `).all(targetCode) as Array<{ fundCode: string }>).map((row) => row.fundCode);
}

export function rebuildStockFundIndex(db: Database.Database, syncRunId: string): number {
  const holdings = db.prepare(`
    SELECT
      fund_code AS fundCode,
      stock_code AS stockCode,
      stock_name AS stockName,
      nav_percent AS navPercent,
      holding_market_value AS holdingMarketValue,
      report_period AS reportPeriod,
      source,
      sync_run_id AS syncRunId
    FROM fund_holdings
  `).all() as FundHolding[];

  const rows = buildStockFundIndexRows(holdings.map((row) => ({ ...row, syncRunId: row.syncRunId || syncRunId })));
  const insert = db.prepare(`
    INSERT OR REPLACE INTO stock_fund_index (
      stock_key, fund_code, stock_code, stock_name, nav_percent, holding_market_value, report_period, source, sync_run_id
    ) VALUES (
      @stockKey, @fundCode, @stockCode, @stockName, @navPercent, @holdingMarketValue, @reportPeriod, @source, @syncRunId
    )
  `);

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM stock_fund_index").run();
    for (const row of rows) {
      insert.run({
        ...row,
        holdingMarketValue: row.holdingMarketValue ?? null
      });
    }
  });
  tx();
  return rows.length;
}
