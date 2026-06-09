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
});
