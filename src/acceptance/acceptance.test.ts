import { describe, expect, it } from "vitest";
import { createInMemoryDatabase } from "../db/database";
import { insertSnapshotBundle, recordSyncStatus } from "../db/repositories";
import { runAcceptance } from "./acceptance";

describe("acceptance checks", () => {
  it("passes when the MVP data surfaces are populated", () => {
    const db = createAcceptanceDatabase();

    const result = runAcceptance(db);

    expect(result.ok).toBe(true);
    expect(result.checks.every((check) => check.ok)).toBe(true);
  });

  it("fails when stock concentration data is missing", () => {
    const db = createAcceptanceDatabase({ holdings: [] });

    const result = runAcceptance(db);

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      key: "stockConcentration",
      ok: false
    }));
  });
});

function createAcceptanceDatabase(overrides: { holdings?: Parameters<typeof insertSnapshotBundle>[1]["holdings"] } = {}) {
  const db = createInMemoryDatabase();
  insertSnapshotBundle(db, {
    syncRunId: "acceptance-run",
    funds: [
      { code: "513100", name: "纳指ETF", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true },
      { code: "000834", name: "纳指100联接A", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "A", enabled: true }
    ],
    quotes: [{ fundCode: "513100", closePrice: 1.23, closingPremiumDiscountRate: 0.012, turnover: 120000000, tradeDate: "2026-06-10", source: "eastmoney-on-exchange-quote", syncRunId: "acceptance-run" }],
    limits: [{ fundCode: "000834", shareClass: "A", status: "limited", limitAmountYuan: 1000, limitUnit: "per_day", channelScope: "agency", source: "tiantian-f10-jjfl", dataDate: "2026-06-11", confidence: 0.9, syncRunId: "acceptance-run" }],
    fees: [
      { fundCode: "000834", feeType: "subscription", rate: 0.0012, amountTierLowerBound: 0, channelScope: "agency", source: "tiantian-f10-jjfl", dataDate: "2026-06-11", syncRunId: "acceptance-run" },
      { fundCode: "000834", feeType: "management", rate: 0.008, channelScope: "agency", source: "tiantian-f10-jjfl", dataDate: "2026-06-11", syncRunId: "acceptance-run" }
    ],
    holdings: overrides.holdings ?? [
      { fundCode: "513100", stockCode: "NVDA", stockName: "NVIDIA Corp", navPercent: 9.2, reportPeriod: "2026Q1", source: "eastmoney-f10-jjcc", syncRunId: "acceptance-run" }
    ]
  });
  for (const area of ["fund", "quote", "purchaseLimit", "fee", "holding"] as const) {
    recordSyncStatus(db, {
      area,
      status: "ok",
      source: "acceptance",
      dataDate: area === "holding" ? "2026Q1" : "2026-06-11",
      itemCount: 1,
      durationMs: 100,
      updatedAt: "2026-06-11T03:00:00.000Z"
    });
  }
  return db;
}
