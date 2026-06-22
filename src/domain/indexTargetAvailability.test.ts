import { describe, expect, it } from "vitest";
import { indexTargetHasFunds, isIndexTargetSelectable } from "./indexTargetAvailability";

describe("indexTargetAvailability", () => {
  it("treats KOSPI as pending until funds are discovered", () => {
    expect(isIndexTargetSelectable("NASDAQ_100", {})).toBe(true);
    expect(isIndexTargetSelectable("KOSPI", {})).toBe(false);
    expect(isIndexTargetSelectable("KOSPI", { KOSPI: true })).toBe(true);
  });

  it("detects whether an index comparison has any funds", () => {
    expect(indexTargetHasFunds({ onExchange: [], offExchange: [] })).toBe(false);
    expect(indexTargetHasFunds({ onExchange: [{ code: "513900" }], offExchange: [] })).toBe(true);
  });
});
