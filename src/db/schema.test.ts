import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "./schema";

describe("schema migration", () => {
  it("relaxes legacy quote premium NOT NULL constraint", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE fund_quotes (
        fund_code TEXT NOT NULL,
        close_price REAL NOT NULL,
        closing_premium_discount_rate REAL NOT NULL,
        turnover REAL,
        trade_date TEXT NOT NULL,
        source TEXT NOT NULL,
        sync_run_id TEXT NOT NULL,
        PRIMARY KEY (fund_code, trade_date, source)
      );
    `);

    migrate(db);
    db.prepare(`
      INSERT INTO fund_quotes (
        fund_code, close_price, closing_premium_discount_rate, turnover, trade_date, source, sync_run_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("513100", 1.23, null, 120000000, "2026-06-08", "eastmoney", "run-1");

    const info = db.prepare("PRAGMA table_info(fund_quotes)").all() as Array<{ name: string; notnull: number }>;
    expect(info.find((column) => column.name === "closing_premium_discount_rate")?.notnull).toBe(0);
  });

  it("adds sync duration to legacy status tables", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE sync_status (
        area TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        source TEXT,
        data_date TEXT,
        item_count INTEGER NOT NULL,
        error_category TEXT,
        message TEXT,
        updated_at TEXT NOT NULL
      );
    `);

    migrate(db);

    const info = db.prepare("PRAGMA table_info(sync_status)").all() as Array<{ name: string }>;
    expect(info.map((column) => column.name)).toContain("duration_ms");
  });

  it("adds audit metadata to legacy provider result tables", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE provider_results (
        sync_run_id TEXT NOT NULL,
        area TEXT NOT NULL,
        attempt_order INTEGER NOT NULL,
        provider_name TEXT NOT NULL,
        ok INTEGER NOT NULL,
        data_date TEXT,
        error_category TEXT,
        message TEXT,
        raw_payload_hash TEXT,
        PRIMARY KEY (sync_run_id, area, attempt_order)
      );
    `);

    migrate(db);

    const info = db.prepare("PRAGMA table_info(provider_results)").all() as Array<{ name: string }>;
    expect(info.map((column) => column.name)).toContain("confidence");
    expect(info.map((column) => column.name)).toContain("fetched_at");
  });
});
