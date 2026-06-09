import express from "express";
import type Database from "better-sqlite3";
import { openDatabase } from "../db/database";
import { queryIndexComparison } from "../db/repositories";
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

  app.get("/api/status", (_req, res) => {
    res.json({
      quote: { status: "ok", lastSuccess: "2026-06-09", source: "eastmoney" },
      purchaseLimit: { status: "ok", lastSuccess: "2026-06-09", source: "tiantian" },
      fee: { status: "ok", lastSuccess: "2026-06-09", source: "tiantian" },
      holding: { status: "ok", lastSuccess: "2026Q1", source: "eastmoney" }
    });
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787);
  createApp(openDatabase()).listen(port, "127.0.0.1", () => {
    console.log(`ETF Limit API listening on http://127.0.0.1:${port}`);
  });
}
