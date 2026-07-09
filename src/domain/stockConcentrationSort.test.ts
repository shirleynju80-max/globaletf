import { describe, expect, it } from "vitest";
import type { StockConcentrationRow } from "../db/repositories";
import { limitSortValue, sortStockConcentrationRows } from "./stockConcentrationSort";

const baseRow = (overrides: Partial<StockConcentrationRow>): StockConcentrationRow => ({
  fundCode: "000001",
  fundName: "测试",
  venue: "off_exchange",
  shareClass: "A",
  stockCode: "NVDA",
  stockName: "英伟达",
  navPercent: 5,
  reportPeriod: "2026Q1",
  source: "test",
  ...overrides
});

describe("stockConcentrationSort", () => {
  it("sorts by limit amount with open funds first when descending", () => {
    const rows = [
      baseRow({ fundCode: "A", purchaseStatus: "limited", limitAmountYuan: 1000 }),
      baseRow({ fundCode: "B", purchaseStatus: "open" }),
      baseRow({ fundCode: "C", purchaseStatus: "limited", limitAmountYuan: 5000 })
    ];
    const sorted = sortStockConcentrationRows(rows, {}, "limit", true).map((row) => row.fundCode);
    expect(sorted).toEqual(["B", "C", "A"]);
    expect(limitSortValue(rows[1])).toBe(Number.POSITIVE_INFINITY);
  });

  it("sorts by return period using injected snapshots", () => {
    const rows = [
      baseRow({ fundCode: "A", navPercent: 1 }),
      baseRow({ fundCode: "B", navPercent: 2 })
    ];
    const returnsByCode = {
      A: { fundCode: "A", asOfDate: "2026-07-01", returns: { "1m": 0.1, "1w": null, "3m": null, "6m": null, "1y": null } },
      B: { fundCode: "B", asOfDate: "2026-07-01", returns: { "1m": 0.2, "1w": null, "3m": null, "6m": null, "1y": null } }
    };
    const sorted = sortStockConcentrationRows(rows, returnsByCode, "1m", true).map((row) => row.fundCode);
    expect(sorted).toEqual(["B", "A"]);
  });
});
