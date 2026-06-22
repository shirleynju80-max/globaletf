import { describe, expect, it } from "vitest";
import type { PurchaseLimit } from "./types";
import { parseSyncRunDate, reconcilePurchaseLimit } from "./purchaseLimitReconciliation";

const baseLimit = (overrides: Partial<PurchaseLimit>): PurchaseLimit => ({
  fundCode: "021000",
  shareClass: "I",
  status: "limited",
  limitUnit: "per_day",
  channelScope: "direct",
  channelId: "nfjj",
  source: "fundco-announcement-nfjj",
  dataDate: "2026-04-08",
  confidence: 0.95,
  syncRunId: "daily-20260616T043844Z",
  ...overrides
});

describe("purchaseLimitReconciliation", () => {
  it("parses sync run ids into calendar dates", () => {
    expect(parseSyncRunDate("daily-20260616T043844Z")).toBe("2026-06-16");
  });

  it("uses direct announcement amount for I shares while tracking latest sync date", () => {
    const reconciled = reconcilePurchaseLimit("I", [
      baseLimit({ limitAmountYuan: 5000 }),
      baseLimit({
        channelScope: "agency",
        channelId: "eastmoney_aggregate",
        source: "tiantian-f10-jjfl",
        dataDate: "2026-06-16",
        limitAmountYuan: undefined,
        confidence: 0.9
      })
    ]);

    expect(reconciled).toMatchObject({
      status: "limited",
      limitAmountYuan: 5000,
      limitEffectiveDate: "2026-04-08",
      limitSyncedAt: "2026-06-16",
      statusConflict: false,
      limitStale: false
    });
  });

  it("flags stale only when a newer announcement row exists in the snapshot", () => {
    const reconciled = reconcilePurchaseLimit("I", [
      baseLimit({ limitAmountYuan: 5000, dataDate: "2026-04-08" }),
      baseLimit({
        limitAmountYuan: 1000,
        dataDate: "2026-06-10",
        source: "fundco-announcement-nfjj"
      })
    ]);

    expect(reconciled.limitAmountYuan).toBe(1000);
    expect(reconciled.limitStale).toBe(false);
  });

  it("prefers suspended status over a newer direct limit amount", () => {
    const reconciled = reconcilePurchaseLimit("I", [
      baseLimit({ limitAmountYuan: 5000, status: "limited" }),
      baseLimit({
        channelScope: "agency",
        channelId: "eastmoney_aggregate",
        source: "tiantian-f10-jjfl",
        dataDate: "2026-06-16",
        status: "suspended",
        limitAmountYuan: undefined,
        confidence: 0.9
      })
    ]);

    expect(reconciled).toMatchObject({
      status: "suspended",
      limitAmountYuan: undefined,
      limitEffectiveDate: "2026-06-16",
      statusConflict: true
    });
  });

  it("flags cross-source status conflicts", () => {
    const reconciled = reconcilePurchaseLimit("A", [
      baseLimit({
        shareClass: "A",
        channelScope: "agency",
        channelId: "eastmoney_aggregate",
        source: "tiantian-f10-jjfl",
        status: "open",
        dataDate: "2026-06-16",
        limitAmountYuan: undefined
      }),
      baseLimit({
        shareClass: "A",
        channelScope: "agency",
        channelId: "eastmoney_aggregate",
        source: "tiantian-f10-jjfl",
        status: "limited",
        dataDate: "2026-06-15",
        limitAmountYuan: 1000
      })
    ]);

    expect(reconciled.status).toBe("limited");
    expect(reconciled.statusConflict).toBe(true);
  });
});
