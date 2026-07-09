import { describe, expect, it } from "vitest";
import { isQdiiHoldingsScanRow, selectQdiiFundsForHoldingsScan } from "./qdiiHoldingsUniverse";
import type { FundSearchRow } from "../providers/eastmoneyFundSearch";

describe("qdiiHoldingsUniverse", () => {
  it("includes index and active QDII products for holdings scans", () => {
    const rows: FundSearchRow[] = [
      { code: "513100", name: "纳指ETF", shortName: "NZ", type: "指数型-海外股票", pinyin: "NZ" },
      { code: "539002", name: "建信新兴市场混合(QDII)A", shortName: "JX", type: "QDII-混合偏股", pinyin: "JX" },
      { code: "006308", name: "华夏全球科技先锋混合(QDII)", shortName: "HX", type: "QDII-混合偏股", pinyin: "HX" },
      { code: "024239", name: "华夏全球科技先锋混合(QDII)C", shortName: "HX", type: "QDII-混合偏股", pinyin: "HX" }
    ];

    expect(isQdiiHoldingsScanRow(rows[0])).toBe(true);
    expect(isQdiiHoldingsScanRow(rows[3])).toBe(true);
    expect(selectQdiiFundsForHoldingsScan(rows).map((fund) => fund.code)).toEqual(["006308", "024239", "513100", "539002"]);
    expect(selectQdiiFundsForHoldingsScan(rows).every((fund) => fund.enabled === false)).toBe(true);
  });
});
