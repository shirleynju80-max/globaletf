import { describe, expect, it } from "vitest";
import {
  beijingDateFromMs,
  expectedIopvGztimeForTradeDate,
  iopvGztimeMatchesTradeSession,
  parseBeijingTimeMs,
  resolveIopvPremium,
  tradeDateCloseMs
} from "./iopvAlignment";

describe("iopvAlignment", () => {
  it("uses current IOPV when gztime matches the A-share trade session", () => {
    const priceTimeMs = Date.UTC(2026, 5, 13, 6, 30); // 2026-06-13 14:30 Beijing
    const result = resolveIopvPremium({
      price: 2.458,
      priceTimeMs,
      tradeDate: "2026-06-13",
      current: { iopv: 2.2866, iopvTime: "2026-06-13 04:00" },
      priorSnapshots: []
    });
    expect(result.aligned).toBe(true);
    expect(result.iopvSource).toBe("current");
    expect(result.iopvPremiumDiscountRate).toBeCloseTo(0.0749, 3);
  });

  it("matches IOPV by trade date when current gztime is from a later US session", () => {
    const priceTimeMs = tradeDateCloseMs("2026-06-12")!;
    const result = resolveIopvPremium({
      price: 2.376,
      priceTimeMs,
      tradeDate: "2026-06-12",
      current: { iopv: 2.30, iopvTime: "2026-06-15 04:00" },
      priorSnapshots: [
        { iopv: 2.2872, iopvTime: "2026-06-13 04:00", iopvTimeMs: parseBeijingTimeMs("2026-06-13 04:00")! },
        { iopv: 2.25, iopvTime: "2026-06-12 04:00", iopvTimeMs: parseBeijingTimeMs("2026-06-12 04:00")! }
      ]
    });
    expect(result.aligned).toBe(false);
    expect(result.iopvSource).toBe("trade_date_match");
    expect(result.iopv).toBe(2.25);
    expect(result.iopvTime).toBe("2026-06-12 04:00");
  });

  it("maps A-share trade date to 15:00 Beijing close", () => {
    expect(tradeDateCloseMs("2026-06-12")).toBe(Date.UTC(2026, 5, 12, 7, 0));
  });

  it("expects IOPV gztime at 04:00 Beijing on the trade date", () => {
    expect(expectedIopvGztimeForTradeDate("2026-06-12")).toBe("2026-06-12 04:00");
  });

  it("rejects gztime on a later calendar day than the trade date", () => {
    const priceTimeMs = tradeDateCloseMs("2026-06-12")!;
    expect(iopvGztimeMatchesTradeSession("2026-06-13 04:00", "2026-06-12", priceTimeMs)).toBe(false);
    expect(iopvGztimeMatchesTradeSession("2026-06-12 04:00", "2026-06-12", priceTimeMs)).toBe(true);
  });

  it("falls back to the nearest prior IOPV snapshot when the trade-date estimate is missing", () => {
    const priceTimeMs = tradeDateCloseMs("2026-06-15")!;
    const result = resolveIopvPremium({
      price: 2.367,
      priceTimeMs,
      tradeDate: "2026-06-15",
      current: { iopv: 2.2327, iopvTime: "2026-06-16 04:00" },
      priorSnapshots: [
        { iopv: 2.1702, iopvTime: "2026-06-13 04:00", iopvTimeMs: parseBeijingTimeMs("2026-06-13 04:00")! }
      ]
    });
    expect(result.iopvSource).toBe("trade_date_match");
    expect(result.iopv).toBe(2.1702);
    expect(result.iopvTime).toBe("2026-06-13 04:00");
  });

  it("derives Beijing trade date from price time when tradeDate is omitted", () => {
    const priceTimeMs = tradeDateCloseMs("2026-06-12")!;
    expect(beijingDateFromMs(priceTimeMs)).toBe("2026-06-12");
  });
});
