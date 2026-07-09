import { describe, expect, it } from "vitest";
import { computePeriodReturns, formatReturnPercent, valueOnOrBefore } from "./fundReturnPeriods";

describe("fundReturnPeriods", () => {
  it("computes calendar-window returns from dated NAV/price series", () => {
    const series = [
      { date: "2025-06-20", value: 1.0 },
      { date: "2025-12-20", value: 1.1 },
      { date: "2026-06-25", value: 1.2 }
    ];
    const snapshot = computePeriodReturns(series);
    expect(snapshot?.asOfDate).toBe("2026-06-25");
    expect(snapshot?.returns["1y"]).toBeCloseTo(0.2, 4);
    expect(snapshot?.returns["6m"]).toBeCloseTo(1.2 / 1.1 - 1, 4);
  });

  it("picks the latest point on or before the anchor date", () => {
    const series = [
      { date: "2026-06-01", value: 1 },
      { date: "2026-06-10", value: 2 }
    ];
    expect(valueOnOrBefore(series, "2026-06-09")?.value).toBe(1);
    expect(valueOnOrBefore(series, "2026-06-10")?.value).toBe(2);
  });

  it("formats signed return percentages", () => {
    expect(formatReturnPercent(0.052)).toBe("+5.20%");
    expect(formatReturnPercent(-0.012)).toBe("-1.20%");
    expect(formatReturnPercent(null)).toBe("—");
  });
});
