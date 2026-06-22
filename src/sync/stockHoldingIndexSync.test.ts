import { describe, expect, it } from "vitest";
import { createInMemoryDatabase } from "../db/database";
import { insertSnapshotBundle, rebuildStockFundIndex } from "../db/repositories";
import { finalizeStockHoldingIndex } from "./stockHoldingIndexSync";

describe("finalizeStockHoldingIndex", () => {
  it("builds stock_fund_index from jjcc rows and enables funds with disclosures", () => {
    const db = createInMemoryDatabase();
    insertSnapshotBundle(db, {
      syncRunId: "run-1",
      funds: [
        { code: "513100", name: "纳指ETF", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true },
        { code: "539002", name: "建信新兴市场混合(QDII)A", fundType: "QDII", venue: "off_exchange", shareClass: "A", enabled: false, discoverySource: "qdii-holdings-scan" }
      ],
      quotes: [],
      limits: [],
      fees: [],
      holdings: [
        { fundCode: "539002", stockCode: "NVDA", stockName: "英伟达", navPercent: 11.5, reportPeriod: "2026Q1", source: "eastmoney-f10-jjcc", syncRunId: "run-1" },
        { fundCode: "513100", stockCode: "NVDA", stockName: "NVIDIA Corp", navPercent: 9.2, reportPeriod: "2026Q1", source: "eastmoney-f10-jjcc", syncRunId: "run-1" }
      ]
    });

    const result = finalizeStockHoldingIndex(db, "run-1", [
      { code: "539002", name: "建信新兴市场混合(QDII)A", fundType: "QDII", venue: "off_exchange", shareClass: "A", enabled: false, discoverySource: "qdii-holdings-scan" }
    ]);

    expect(result.indexRows).toBe(2);
    expect(result.enabledFundCodes).toEqual(expect.arrayContaining(["539002", "513100"]));
    expect(db.prepare("SELECT enabled FROM funds WHERE code = '539002'").get()).toEqual({ enabled: 1 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM stock_fund_index WHERE stock_key = 'NVDA'").get()).toEqual({ count: 2 });
  });
});
