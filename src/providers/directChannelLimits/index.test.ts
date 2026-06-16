import { describe, expect, it } from "vitest";
import type { Fund, PurchaseLimit } from "../../domain/types";
import { mergeDirectLimits } from "./index";

const baseLimit = (overrides: Partial<PurchaseLimit>): PurchaseLimit => ({
  fundCode: "021000",
  shareClass: "I",
  status: "limited",
  limitUnit: "per_day",
  channelScope: "direct",
  channelId: "nfjj",
  source: "fundco-direct-nfjj",
  dataDate: "2026-06-10",
  confidence: 0.8,
  syncRunId: "run-1",
  ...overrides
});

describe("mergeDirectLimits", () => {
  it("keeps the higher-confidence row per fund/channel", () => {
    const merged = mergeDirectLimits([
      baseLimit({ limitAmountYuan: 10000, confidence: 0.8, source: "fundco-announcement-nfjj" }),
      baseLimit({ limitAmountYuan: 20000, confidence: 0.95, source: "fundco-direct-nfjj" })
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.limitAmountYuan).toBe(20000);
    expect(merged[0]?.source).toBe("fundco-direct-nfjj");
  });
});
