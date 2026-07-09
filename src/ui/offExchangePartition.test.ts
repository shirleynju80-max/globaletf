import { describe, expect, it } from "vitest";
import { needsLimitReview, partitionOffExchangeRows } from "./offExchangePartition";

describe("offExchangePartition", () => {
  it("splits suspended, review, and active rows", () => {
    const rows = [
      { code: "a", status: "limited", limitAmountYuan: 1000 },
      { code: "b", status: "limited", limitStale: true },
      { code: "c", status: "suspended" },
      { code: "d", status: "limited", limitStatusConflict: true }
    ];

    expect(partitionOffExchangeRows(rows)).toEqual({
      active: [
        { code: "a", status: "limited", limitAmountYuan: 1000 },
        { code: "d", status: "limited", limitStatusConflict: true }
      ],
      review: [
        { code: "b", status: "limited", limitStale: true }
      ],
      suspended: [{ code: "c", status: "suspended" }]
    });
  });

  it("treats stale rows as review without letting diagnostic conflicts change the chosen status bucket", () => {
    expect(needsLimitReview({ limitStale: true })).toBe(true);
    expect(needsLimitReview({ limitStatusConflict: true })).toBe(false);
    expect(needsLimitReview({ status: "limited" })).toBe(false);
  });
});
