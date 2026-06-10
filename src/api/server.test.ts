import { describe, expect, it } from "vitest";
import { createInMemoryDatabase } from "../db/database";
import { recordSyncStatus } from "../db/repositories";
import { runDailySync } from "../sync/syncRunner";
import { createApp } from "./server";

describe("local API", () => {
  it("serves index comparison data", async () => {
    const db = createInMemoryDatabase();
    await runDailySync(db);
    const app = createApp(db);
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP server address");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/index-comparison/NASDAQ_100`);
    const data = await response.json();
    server.close();

    expect(response.status).toBe(200);
    expect(data.onExchange.length).toBeGreaterThan(0);
  });

  it("allows the Vite UI to call the local API", async () => {
    const db = createInMemoryDatabase();
    const app = createApp(db);
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP server address");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/status`, {
      headers: { Origin: "http://127.0.0.1:5173" }
    });
    server.close();

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("serves stock concentration data", async () => {
    const db = createInMemoryDatabase();
    await runDailySync(db);
    const app = createApp(db);
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP server address");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/stock-concentration/NVDA`);
    const data = await response.json();
    server.close();

    expect(response.status).toBe(200);
    expect(data[0]).toMatchObject({ fundCode: "513100", stockCode: "NVDA", navPercent: 8.5 });
  });

  it("serves persisted sync status data", async () => {
    const db = createInMemoryDatabase();
    recordSyncStatus(db, {
      area: "holding",
      status: "ok",
      source: "eastmoney-f10-jjcc",
      dataDate: "2026Q1",
      itemCount: 280,
      updatedAt: "2026-06-10T09:30:00.000Z"
    });
    const app = createApp(db);
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP server address");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/status`);
    const data = await response.json();
    server.close();

    expect(response.status).toBe(200);
    expect(data.holding).toMatchObject({
      status: "ok",
      source: "eastmoney-f10-jjcc",
      dataDate: "2026Q1",
      itemCount: 280
    });
    expect(data.holding.lastSuccess).toBeUndefined();
  });
});
