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
      unit_nav REAL,
      nav_date TEXT,
      iopv REAL,
      iopv_time TEXT,
      iopv_premium_discount_rate REAL,
      price_time TEXT,
      iopv_aligned INTEGER,
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
      limit_amount REAL,
      limit_currency TEXT,
      limit_amount_yuan REAL,
      limit_unit TEXT,
      channel_scope TEXT NOT NULL,
      channel_id TEXT NOT NULL DEFAULT 'aggregate',
      source TEXT NOT NULL,
      data_date TEXT NOT NULL,
      confidence REAL NOT NULL,
      sync_run_id TEXT NOT NULL,
      PRIMARY KEY (fund_code, share_class, channel_scope, channel_id, data_date, source)
    );

    CREATE TABLE IF NOT EXISTS fund_tracking_profiles (
      fund_code TEXT PRIMARY KEY,
      tracking_index TEXT,
      benchmark TEXT,
      verified_ok INTEGER NOT NULL,
      verified_at TEXT NOT NULL
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

    CREATE TABLE IF NOT EXISTS sync_status (
      area TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      source TEXT,
      data_date TEXT,
      item_count INTEGER NOT NULL,
      fresh_item_count INTEGER,
      cached_item_count INTEGER,
      duration_ms INTEGER,
      error_category TEXT,
      message TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_runs (
      sync_run_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS provider_results (
      sync_run_id TEXT NOT NULL,
      area TEXT NOT NULL,
      attempt_order INTEGER NOT NULL,
      provider_name TEXT NOT NULL,
      ok INTEGER NOT NULL,
      confidence REAL,
      fetched_at TEXT,
      data_date TEXT,
      error_category TEXT,
      message TEXT,
      raw_payload_hash TEXT,
      PRIMARY KEY (sync_run_id, area, attempt_order),
      FOREIGN KEY (sync_run_id) REFERENCES sync_runs(sync_run_id)
    );

    CREATE TABLE IF NOT EXISTS fund_discovery_manifest (
      fund_code TEXT PRIMARY KEY,
      tracking_target_code TEXT NOT NULL,
      venue TEXT NOT NULL,
      share_class TEXT NOT NULL,
      discovery_source TEXT NOT NULL,
      sync_run_id TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS discovery_profile_gaps (
      target_code TEXT NOT NULL,
      fund_code TEXT NOT NULL,
      venue TEXT NOT NULL,
      sync_run_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (target_code, fund_code)
    );

    CREATE TABLE IF NOT EXISTS stock_fund_index (
      stock_key TEXT NOT NULL,
      fund_code TEXT NOT NULL,
      stock_code TEXT NOT NULL,
      stock_name TEXT NOT NULL,
      nav_percent REAL NOT NULL,
      holding_market_value REAL,
      report_period TEXT NOT NULL,
      source TEXT NOT NULL,
      sync_run_id TEXT NOT NULL,
      PRIMARY KEY (stock_key, fund_code, report_period, source)
    );

    CREATE TABLE IF NOT EXISTS fund_return_snapshots (
      fund_code TEXT PRIMARY KEY,
      venue TEXT NOT NULL,
      as_of_date TEXT NOT NULL,
      returns_json TEXT NOT NULL,
      sync_run_id TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  relaxLegacyQuotePremiumConstraint(db);
  addSyncStatusCountColumns(db);
  addProviderResultColumns(db);
  addQuoteNavColumns(db);
  addQuoteIopvColumns(db);
  addQuoteAlignmentColumns(db);
  addPurchaseLimitChannelIdColumn(db);
  addPurchaseLimitCurrencyColumns(db);
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
      unit_nav REAL,
      nav_date TEXT,
      turnover REAL,
      trade_date TEXT NOT NULL,
      source TEXT NOT NULL,
      sync_run_id TEXT NOT NULL,
      PRIMARY KEY (fund_code, trade_date, source)
    );

    INSERT INTO fund_quotes (
      fund_code, close_price, closing_premium_discount_rate, unit_nav, nav_date, turnover, trade_date, source, sync_run_id
    )
    SELECT
      fund_code, close_price, closing_premium_discount_rate, NULL, NULL, turnover, trade_date, source, sync_run_id
    FROM fund_quotes_legacy_notnull;

    DROP TABLE fund_quotes_legacy_notnull;
  `);
}

function addSyncStatusCountColumns(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(sync_status)").all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));

  if (!names.has("fresh_item_count")) {
    db.exec("ALTER TABLE sync_status ADD COLUMN fresh_item_count INTEGER");
  }
  if (!names.has("cached_item_count")) {
    db.exec("ALTER TABLE sync_status ADD COLUMN cached_item_count INTEGER");
  }
  if (!names.has("duration_ms")) {
    db.exec("ALTER TABLE sync_status ADD COLUMN duration_ms INTEGER");
  }
}

function addProviderResultColumns(db: Database.Database): void {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'provider_results'").get();
  if (!table) return;

  const columns = db.prepare("PRAGMA table_info(provider_results)").all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));

  if (!names.has("confidence")) {
    db.exec("ALTER TABLE provider_results ADD COLUMN confidence REAL");
  }
  if (!names.has("fetched_at")) {
    db.exec("ALTER TABLE provider_results ADD COLUMN fetched_at TEXT");
  }
}

function addQuoteNavColumns(db: Database.Database): void {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'fund_quotes'").get();
  if (!table) return;

  const columns = db.prepare("PRAGMA table_info(fund_quotes)").all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));

  if (!names.has("unit_nav")) {
    db.exec("ALTER TABLE fund_quotes ADD COLUMN unit_nav REAL");
  }
  if (!names.has("nav_date")) {
    db.exec("ALTER TABLE fund_quotes ADD COLUMN nav_date TEXT");
  }
}

function addQuoteIopvColumns(db: Database.Database): void {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'fund_quotes'").get();
  if (!table) return;

  const columns = db.prepare("PRAGMA table_info(fund_quotes)").all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));

  if (!names.has("iopv")) {
    db.exec("ALTER TABLE fund_quotes ADD COLUMN iopv REAL");
  }
  if (!names.has("iopv_time")) {
    db.exec("ALTER TABLE fund_quotes ADD COLUMN iopv_time TEXT");
  }
  if (!names.has("iopv_premium_discount_rate")) {
    db.exec("ALTER TABLE fund_quotes ADD COLUMN iopv_premium_discount_rate REAL");
  }
}

function addQuoteAlignmentColumns(db: Database.Database): void {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'fund_quotes'").get();
  if (!table) return;

  const columns = db.prepare("PRAGMA table_info(fund_quotes)").all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));

  if (!names.has("price_time")) {
    db.exec("ALTER TABLE fund_quotes ADD COLUMN price_time TEXT");
  }
  if (!names.has("iopv_aligned")) {
    db.exec("ALTER TABLE fund_quotes ADD COLUMN iopv_aligned INTEGER");
  }
}

function addPurchaseLimitChannelIdColumn(db: Database.Database): void {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'purchase_limits'").get();
  if (!table) return;

  const columns = db.prepare("PRAGMA table_info(purchase_limits)").all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === "channel_id")) return;

  db.exec(`
    ALTER TABLE purchase_limits RENAME TO purchase_limits_legacy;

    CREATE TABLE purchase_limits (
      fund_code TEXT NOT NULL,
      share_class TEXT NOT NULL,
      status TEXT NOT NULL,
      limit_amount REAL,
      limit_currency TEXT,
      limit_amount_yuan REAL,
      limit_unit TEXT,
      channel_scope TEXT NOT NULL,
      channel_id TEXT NOT NULL DEFAULT 'aggregate',
      source TEXT NOT NULL,
      data_date TEXT NOT NULL,
      confidence REAL NOT NULL,
      sync_run_id TEXT NOT NULL,
      PRIMARY KEY (fund_code, share_class, channel_scope, channel_id, data_date, source)
    );

    INSERT INTO purchase_limits (
      fund_code, share_class, status, limit_amount, limit_currency, limit_amount_yuan, limit_unit, channel_scope, channel_id, source, data_date, confidence, sync_run_id
    )
    SELECT
      fund_code, share_class, status, limit_amount_yuan, CASE WHEN limit_amount_yuan IS NOT NULL THEN 'CNY' ELSE NULL END, limit_amount_yuan, limit_unit, channel_scope, 'aggregate', source, data_date, confidence, sync_run_id
    FROM purchase_limits_legacy;

    DROP TABLE purchase_limits_legacy;
  `);
}

function addPurchaseLimitCurrencyColumns(db: Database.Database): void {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'purchase_limits'").get();
  if (!table) return;

  const columns = db.prepare("PRAGMA table_info(purchase_limits)").all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));

  if (!names.has("limit_amount")) {
    db.exec("ALTER TABLE purchase_limits ADD COLUMN limit_amount REAL");
    db.exec("UPDATE purchase_limits SET limit_amount = limit_amount_yuan WHERE limit_amount_yuan IS NOT NULL");
  }
  if (!names.has("limit_currency")) {
    db.exec("ALTER TABLE purchase_limits ADD COLUMN limit_currency TEXT");
    db.exec("UPDATE purchase_limits SET limit_currency = 'CNY' WHERE limit_amount_yuan IS NOT NULL AND limit_currency IS NULL");
  }
}
