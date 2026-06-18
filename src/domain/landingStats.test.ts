import { describe, expect, it } from "vitest";
import { buildLandingStats, formatHundredsPlus, countActiveTrackingIndexTargets } from "./landingStats";

describe("landingStats", () => {
  it("formats stock index coverage in hundreds", () => {
    expect(formatHundredsPlus(615)).toBe("600+");
    expect(formatHundredsPlus(99)).toBe("99+");
  });

  it("counts active tracking indexes and excludes pending targets until funds exist", () => {
    expect(countActiveTrackingIndexTargets()).toBe(4);
    expect(countActiveTrackingIndexTargets({ KOSPI: true })).toBe(5);
  });

  it("builds landing KPI labels", () => {
    expect(buildLandingStats({ stockIndexCount: 615 })).toEqual({
      trackingIndexLabel: "4+",
      stockIndexLabel: "600+"
    });
  });
});
