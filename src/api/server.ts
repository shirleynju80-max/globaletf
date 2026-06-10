import express from "express";
import type Database from "better-sqlite3";
import { openDatabase } from "../db/database";
import { queryIndexComparison, queryStockConcentration, querySyncStatus } from "../db/repositories";
import { TARGETS } from "../domain/targets";

export function createApp(db: Database.Database) {
  const app = express();

  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    next();
  });

  app.get("/api/targets", (_req, res) => {
    res.json(TARGETS);
  });

  app.get("/api/index-comparison/:targetCode", (req, res) => {
    res.json(queryIndexComparison(db, req.params.targetCode));
  });

  app.get("/api/stock-concentration/:stockCode", (req, res) => {
    res.json(queryStockConcentration(db, req.params.stockCode));
  });

  app.get("/api/status", (_req, res) => {
    res.json(querySyncStatus(db));
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787);
  createApp(openDatabase()).listen(port, "127.0.0.1", () => {
    console.log(`ETF Limit API listening on http://127.0.0.1:${port}`);
  });
}
