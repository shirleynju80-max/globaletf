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
      active: [{ code: "a", status: "limited", limitAmountYuan: 1000 }],
      review: [
        { code: "b", status: "limited", limitStale: true },
        { code: "d", status: "limited", limitStatusConflict: true }
      ],
      suspended: [{ code: "c", status: "suspended" }]
    });
  });

  it("treats stale or conflict flags as review", () => {
    expect(needsLimitReview({ limitStale: true })).toBe(true);
    expect(needsLimitReview({ limitStatusConflict: true })).toBe(true);
    expect(needsLimitReview({ status: "limited" })).toBe(false);
  });
});
