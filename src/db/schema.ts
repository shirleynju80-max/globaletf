import type Database from "better-sqlite3";

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS funds (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      fund_type TEXT NOT NULL,
      venue TEXT NOT NULL,
      fund_company TEXT,
      tracking_target_code TEXT,
      share_class TEXT NOT NULL,
      parent_fund_code TEXT,
      enabled INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fund_quotes (
      fund_code TEXT NOT NULL,
      close_price REAL NOT NULL,
      closing_premium_discount_rate REAL,
      turnover REAL,
      trade_date TEXT NOT NULL,
      source TEXT NOT NULL,
      sync_run_id TEXT NOT NULL,
      PRIMARY KEY (fund_code, trade_date, source)
    );

    CREATE TABLE IF NOT EXISTS purchase_limits (
      fund_code TEXT NOT NULL,
      share_class TEXT NOT NULL,
      status TEXT NOT NULL,
      limit_amount_yuan REAL,
      limit_unit TEXT,
      channel_scope TEXT NOT NULL,
      source TEXT NOT NULL,
      data_date TEXT NOT NULL,
      confidence REAL NOT NULL,
      sync_run_id TEXT NOT NULL,
      PRIMARY KEY (fund_code, share_class, channel_scope, data_date, source)
    );

    CREATE TABLE IF NOT EXISTS fund_fees (
      fund_code TEXT NOT NULL,
      fee_type TEXT NOT NULL,
      rate REAL NOT NULL,
      min_holding_days INTEGER,
      max_holding_days INTEGER,
      amount_tier_lower_bound REAL,
      amount_tier_upper_bound REAL,
      channel_scope TEXT NOT NULL,
      source TEXT NOT NULL,
      data_date TEXT NOT NULL,
      sync_run_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fund_holdings (
      fund_code TEXT NOT NULL,
      stock_code TEXT NOT NULL,
      stock_name TEXT NOT NULL,
      nav_percent REAL NOT NULL,
      holding_market_value REAL,
      report_period TEXT NOT NULL,
      source TEXT NOT NULL,
      sync_run_id TEXT NOT NULL,
      PRIMARY KEY (fund_code, stock_code, report_period, source)
    );
  `);

  relaxLegacyQuotePremiumConstraint(db);
}

function relaxLegacyQuotePremiumConstraint(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(fund_quotes)").all() as Array<{ name: string; notnull: number }>;
  const premiumColumn = columns.find((column) => column.name === "closing_premium_discount_rate");
  if (!premiumColumn?.notnull) return;

  db.exec(`
    ALTER TABLE fund_quotes RENAME TO fund_quotes_legacy_notnull;

    CREATE TABLE fund_quotes (
      fund_code TEXT NOT NULL,
      close_price REAL NOT NULL,
      closing_premium_discount_rate REAL,
      turnover REAL,
      trade_date TEXT NOT NULL,
      source TEXT NOT NULL,
      sync_run_id TEXT NOT NULL,
      PRIMARY KEY (fund_code, trade_date, source)
    );

    INSERT INTO fund_quotes (
      fund_code, close_price, closing_premium_discount_rate, turnover, trade_date, source, sync_run_id
    )
    SELECT
      fund_code, close_price, closing_premium_discount_rate, turnover, trade_date, source, sync_run_id
    FROM fund_quotes_legacy_notnull;

    DROP TABLE fund_quotes_legacy_notnull;
  `);
}
