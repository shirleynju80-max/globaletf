import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";
import { openDatabase } from "../db/database";
import { queryIndexComparison, queryDiscoveryHealthForTarget, queryOnExchangeFundCodes, queryStockConcentration, querySyncStatus } from "../db/repositories";
import { TARGETS } from "../domain/targets";
import { fetchLivePremiums } from "../providers/eastmoneyLiveQuotes";
import { queryPriorIopvSnapshots } from "../sync/iopvQuoteEnrichment";
import { runDailySync } from "../sync/syncRunner";

function queryLatestQuoteTradeDates(db: Database.Database, fundCodes: string[]): Map<string, string> {
  if (fundCodes.length === 0) return new Map();
  const placeholders = fundCodes.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT fund_code AS fundCode, trade_date AS tradeDate
    FROM fund_quotes q
    WHERE fund_code IN (${placeholders})
      AND q.rowid = (
        SELECT q2.rowid
        FROM fund_quotes q2
        WHERE q2.fund_code = q.fund_code
        ORDER BY q2.trade_date DESC
        LIMIT 1
      )
  `).all(...fundCodes) as Array<{ fundCode: string; tradeDate: string }>;
  return new Map(rows.map((row) => [row.fundCode, row.tradeDate]));
}

export interface CreateAppOptions {
  fetchImpl?: typeof fetch;
}

export function createApp(db: Database.Database, options: CreateAppOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const app = express();

  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (_req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get("/api/targets", (_req, res) => {
    res.json(TARGETS);
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/discovery-health/:targetCode", (req, res) => {
    res.json(queryDiscoveryHealthForTarget(db, req.params.targetCode));
  });

  app.get("/api/index-comparison/:targetCode", (req, res) => {
    res.json(queryIndexComparison(db, req.params.targetCode));
  });

  app.get("/api/stock-concentration/:stockCode", (req, res) => {
    const dedupe = req.query.expandPeers !== "1";
    res.json(queryStockConcentration(db, req.params.stockCode, { dedupe }));
  });

  app.get("/api/status", (_req, res) => {
    res.json(querySyncStatus(db));
  });

  // On-demand live premium: fetches current secondary-market price + real-time IOPV
  // for the target's on-exchange funds and computes the live premium/discount.
  app.get("/api/live-premium/:targetCode", async (req, res) => {
    const funds = queryOnExchangeFundCodes(db, req.params.targetCode);
    const codeFilter = parseFundCodeFilter(req.query.codes);
    const selectedFunds = codeFilter
      ? funds.filter((fund) => codeFilter.has(fund.code))
      : funds;
    if (selectedFunds.length === 0) {
      res.json({ asOf: new Date().toISOString(), rows: [] });
      return;
    }
    try {
      const codes = selectedFunds.map((fund) => fund.code);
      const priorSnapshotsByCode = new Map(codes.map((code) => [code, queryPriorIopvSnapshots(db, code)]));
      const tradeDateByCode = queryLatestQuoteTradeDates(db, codes);
      const premiums = await fetchLivePremiums(fetchImpl, codes, { priorSnapshotsByCode, tradeDateByCode });
      const nameByCode = new Map(selectedFunds.map((fund) => [fund.code, fund.name]));
      res.json({
        asOf: new Date().toISOString(),
        rows: premiums.map((row) => ({ ...row, name: nameByCode.get(row.fundCode) ?? null }))
      });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : "Failed to fetch live premium" });
    }
  });

  // Re-scrape off-exchange purchase limits (F10 + fund-company pages/announcements) and persist.
  app.post("/api/sync-limits/:targetCode", async (req, res) => {
    try {
      await runDailySync(db, { useLiveProviders: true, areas: ["offExchange"] });
      res.json({
        asOf: new Date().toISOString(),
        offExchange: queryIndexComparison(db, req.params.targetCode).offExchange,
        syncStatus: querySyncStatus(db)
      });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : "Failed to sync off-exchange limits" });
    }
  });

  const staticRoot = process.env.STATIC_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist");
  if (process.env.SERVE_STATIC === "1") {
    app.use(express.static(staticRoot));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(staticRoot, "index.html"));
    });
  }

  return app;
}

function parseFundCodeFilter(value: unknown): Set<string> | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const codes = value.split(",").map((code) => code.trim()).filter(Boolean);
  return codes.length > 0 ? new Set(codes) : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? "127.0.0.1";
  const dbPath = process.env.DATABASE_PATH ?? "data/etflimit.sqlite";
  createApp(openDatabase(dbPath)).listen(port, host, () => {
    console.log(`ETF Limit API listening on http://${host}:${port}`);
  });
}
