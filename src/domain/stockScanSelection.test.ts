import { describe, expect, it } from "vitest";
import { isActiveQdiiStockScanRow, isIndexTrackerSearchRow, selectActiveQdiiFundsForStockScan } from "./stockScanSelection";
import type { FundSearchRow } from "../providers/eastmoneyFundSearch";

describe("stockScanSelection", () => {
  it("treats index trackers as excluded from the stock scan universe", () => {
    expect(isIndexTrackerSearchRow({
      code: "513100",
      name: "纳指ETF",
      shortName: "NZETF",
      type: "指数型-海外股票",
      pinyin: "NZETF"
    })).toBe(true);
  });

  it("includes active QDII funds that are not index trackers", () => {
    const row: FundSearchRow = {
      code: "539002",
      name: "建信新兴市场混合(QDII)A",
      shortName: "JX",
      type: "QDII-混合偏股",
      pinyin: "JX"
    };
    expect(isActiveQdiiStockScanRow(row)).toBe(true);
    expect(selectActiveQdiiFundsForStockScan([row])).toEqual([
      expect.objectContaining({
        code: "539002",
        trackingTargetCode: undefined,
        discoverySource: "stock-scan"
      })
    ]);
  });

  it("includes QDII mixed funds without explicit share-class suffix as A share", () => {
    const row: FundSearchRow = {
      code: "006308",
      name: "华夏全球科技先锋混合(QDII)",
      shortName: "HX",
      type: "QDII-混合偏股",
      pinyin: "HX"
    };
    expect(isActiveQdiiStockScanRow(row)).toBe(true);
    expect(selectActiveQdiiFundsForStockScan([row]).map((fund) => fund.code)).toEqual(["006308"]);
  });

  it("excludes index QDII even when they are QDII products", () => {
    const row: FundSearchRow = {
      code: "000834",
      name: "大成纳斯达克100ETF联接(QDII)A",
      shortName: "DC",
      type: "指数型-海外股票",
      pinyin: "DC"
    };
    expect(isActiveQdiiStockScanRow(row)).toBe(false);
  });
});
