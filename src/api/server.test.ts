import { describe, expect, it } from "vitest";
import { createInMemoryDatabase } from "../db/database";
import { recordSyncStatus } from "../db/repositories";
import type { OffExchangeFeeLimitSnapshot } from "../providers/eastmoneyF10";
import type { DataProvider } from "../providers/types";
import { runDailySync } from "../sync/syncRunner";
import { createApp } from "./server";

describe("local API", () => {
  it("serves health check", async () => {
    const db = createInMemoryDatabase();
    const app = createApp(db);
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP server address");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    const data = await response.json();
    server.close();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });
  });

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
    expect(data.rows[0]).toMatchObject({ fundCode: "513100", stockCode: "NVDA", navPercent: 8.5 });
    expect(data.meta).toMatchObject({ dataSource: expect.any(String), totalBeforeDedupe: expect.any(Number) });
  });

  it("serves on-demand live premium computed from injected price and IOPV sources", async () => {
    const db = createInMemoryDatabase();
    await runDailySync(db);
    const fetchImpl = (async (url: Parameters<typeof fetch>[0]) => {
      const u = String(url);
      if (u.includes("ulist.np")) {
        return new Response(JSON.stringify({ data: { diff: [{ f12: "513100", f2: 1.5, f124: 1781496792 }] } }), { status: 200 });
      }
      if (u.includes("fundgz.1234567.com.cn")) {
        return new Response(`jsonpgz({"fundcode":"513100","jzrq":"2026-06-11","dwjz":"1.4","gsz":"1.4","gszzl":"0.1","gztime":"2026-06-15 04:00"});`, { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;
    const app = createApp(db, { fetchImpl });
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP server address");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/live-premium/NASDAQ_100`);
    const data = await response.json();
    server.close();

    expect(response.status).toBe(200);
    expect(typeof data.asOf).toBe("string");
    const row = data.rows.find((entry: { fundCode: string }) => entry.fundCode === "513100");
    expect(row).toMatchObject({ price: 1.5, iopv: 1.4 });
    expect(row.iopvPremiumDiscountRate).toBeCloseTo(0.0714, 3);
  });

  it("supports fetching live premium for a subset of fund codes", async () => {
    const db = createInMemoryDatabase();
    await runDailySync(db);
    const fetchImpl = (async (url: Parameters<typeof fetch>[0]) => {
      const u = String(url);
      if (u.includes("ulist.np") && u.includes("513100")) {
        return new Response(JSON.stringify({ data: { diff: [{ f12: "513100", f2: 1.5, f124: 1781496792 }] } }), { status: 200 });
      }
      if (u.includes("fundgz.1234567.com.cn") && u.includes("513100")) {
        return new Response(`jsonpgz({"fundcode":"513100","jzrq":"2026-06-11","dwjz":"1.4","gsz":"1.4","gszzl":"0.1","gztime":"2026-06-15 14:00"});`, { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;
    const app = createApp(db, { fetchImpl });
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP server address");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/live-premium/NASDAQ_100?codes=513100`);
    const data = await response.json();
    server.close();

    expect(response.status).toBe(200);
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].fundCode).toBe("513100");
  });

  it("serves LOF live premium against disclosed NAV instead of fundgz estimate", async () => {
    const db = createInMemoryDatabase();
    await runDailySync(db);
    const priceTimeMs = Date.UTC(2026, 6, 2, 3, 50, 24);
    const fetchImpl = (async (url: Parameters<typeof fetch>[0]) => {
      const u = String(url);
      if (u.includes("ulist.np") && u.includes("161130")) {
        return new Response(JSON.stringify({
          data: { diff: [{ f12: "161130", f2: 4.646, f441: 0, f124: Math.floor(priceTimeMs / 1000) }] }
        }), { status: 200 });
      }
      if (u.includes("fundgz.1234567.com.cn") && u.includes("161130")) {
        return new Response(`jsonpgz({"fundcode":"161130","jzrq":"2026-06-30","dwjz":"4.5726","gsz":"4.5056","gszzl":"-1.47","gztime":"2026-07-02 04:00"});`, { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;
    const app = createApp(db, { fetchImpl });
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP server address");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/live-premium/NASDAQ_100?codes=161130`);
    const data = await response.json();
    server.close();

    expect(response.status).toBe(200);
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]).toMatchObject({ fundCode: "161130", price: 4.646, iopv: 4.5726, iopvTime: "2026-06-30 15:00", iopvSource: "nav" });
    expect(data.rows[0].iopvPremiumDiscountRate).toBeCloseTo((4.646 - 4.5726) / 4.5726, 4);
  });

  it("serves discovery health for a target", async () => {
    const db = createInMemoryDatabase();
    await runDailySync(db);
    const app = createApp(db);
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP server address");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/discovery-health/NASDAQ_100`);
    const data = await response.json();
    server.close();

    expect(response.status).toBe(200);
    expect(data.targetCode).toBe("NASDAQ_100");
    expect(typeof data.manifestCount).toBe("number");
    expect(Array.isArray(data.profileGaps)).toBe(true);
    expect(Array.isArray(data.coverageGaps)).toBe(true);
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

  it("re-syncs off-exchange limits and returns updated comparison rows", async () => {
    const db = createInMemoryDatabase();
    await runDailySync(db);
    const offExchangeProvider: DataProvider<OffExchangeFeeLimitSnapshot> = {
      name: "test-offexchange",
      fetch: async () => ({
        ok: true,
        source: "test-offexchange",
        dataDate: "2026-06-12",
        confidence: 0.9,
        data: {
          limits: [{ fundCode: "000834", shareClass: "A", status: "limited", limitAmountYuan: 888, limitUnit: "per_day", channelScope: "agency", source: "test-offexchange", dataDate: "2026-06-12", confidence: 0.9, syncRunId: "test-run" }],
          fees: []
        }
      })
    };
    const app = createApp(db, {
      syncLimits: async (database) => {
        await runDailySync(database, { areas: ["offExchange"], offExchangeProviders: [offExchangeProvider] });
      }
    });
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP server address");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/sync-limits/NASDAQ_100`, { method: "POST" });
    const data = await response.json();
    server.close();

    expect(response.status).toBe(200);
    expect(typeof data.asOf).toBe("string");
    expect(Array.isArray(data.offExchange)).toBe(true);
    expect(data.offExchange.find((row: { code: string }) => row.code === "000834")).toMatchObject({ limitAmountYuan: 888 });
    expect(data.syncStatus?.purchaseLimit?.status).toBeDefined();
  });
});
