import { describe, expect, it } from "vitest";
import { dedupeStockConcentrationRows, type StockConcentrationFundMeta } from "./stockConcentrationDedup";

describe("dedupeStockConcentrationRows", () => {
  it("keeps all non-index funds and collapses index trackers to top representatives", () => {
    const rows = [
      { fundCode: "539002", navPercent: 11.5 },
      { fundCode: "000834", navPercent: 10.1 },
      { fundCode: "513100", navPercent: 9.2 },
      { fundCode: "159513", navPercent: 9.0 },
      { fundCode: "159632", navPercent: 8.8 }
    ];
    const meta = new Map<string, StockConcentrationFundMeta>([
      ["539002", { trackingTargetCode: null, fundName: "建信新兴市场混合(QDII)A" }],
      ["000834", { trackingTargetCode: "NASDAQ_100", parentFundCode: "000834", fundName: "纳指100联接A" }],
      ["513100", { trackingTargetCode: "NASDAQ_100", fundName: "纳指ETF" }],
      ["159513", { trackingTargetCode: "NASDAQ_100", fundName: "纳斯达克100ETF大成" }],
      ["159632", { trackingTargetCode: "NASDAQ_100", fundName: "纳斯达克ETF华安" }]
    ]);

    const result = dedupeStockConcentrationRows(rows, meta, { maxPerTrackingTarget: 2 });

    expect(result.map((row) => row.fundCode)).toEqual(["539002", "000834", "513100"]);
  });

  it("collapses share classes within the same index product family", () => {
    const rows = [
      { fundCode: "016532", navPercent: 11.5 },
      { fundCode: "000834", navPercent: 10.1 }
    ];
    const meta = new Map<string, StockConcentrationFundMeta>([
      ["016532", { trackingTargetCode: "NASDAQ_100", parentFundCode: "000834", fundName: "纳指100联接C" }],
      ["000834", { trackingTargetCode: "NASDAQ_100", parentFundCode: "000834", fundName: "纳指100联接A" }]
    ]);

    const result = dedupeStockConcentrationRows(rows, meta, { maxPerTrackingTarget: 2 });

    expect(result.map((row) => row.fundCode)).toEqual(["016532"]);
  });
});
