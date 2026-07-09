import { describe, expect, it } from "vitest";
import type { Fund, PurchaseLimit } from "../../domain/types";
import { isDirectShareFund, mergeDirectLimits } from "./index";

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

  it("prefers a known-status announcement over a higher-confidence unknown company page row", () => {
    const merged = mergeDirectLimits([
      baseLimit({ status: "suspended", confidence: 0.85, source: "fundco-announcement-bosera", channelId: "bosera" }),
      baseLimit({ status: "unknown", confidence: 0.92, source: "fundco-direct-bosera", channelId: "bosera" })
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ status: "suspended", source: "fundco-announcement-bosera" });
  });
});

describe("isDirectShareFund", () => {
  it("includes foreign-currency OTC shares so official announcement limits can fill USD amounts", () => {
    const fund: Fund = {
      code: "017642",
      name: "摩根标普500指数(QDII)美钞",
      fundType: "指数型-海外股票",
      venue: "off_exchange",
      shareClass: "A",
      enabled: true
    };

    expect(isDirectShareFund(fund)).toBe(true);
  });
});
