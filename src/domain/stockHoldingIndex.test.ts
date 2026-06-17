import { describe, expect, it } from "vitest";
import { buildStockFundIndexRows, canonicalStockKey, lookupStockKey } from "./stockHoldingIndex";
import type { FundHolding } from "./types";

describe("stockHoldingIndex", () => {
  it("maps NVDA disclosures by code and Chinese name", () => {
    expect(canonicalStockKey("NVDA", "NVIDIA Corp")).toBe("NVDA");
    expect(canonicalStockKey("", "英伟达")).toBe("NVDA");
    expect(canonicalStockKey("000660", "SK海力士")).toBe("HYNIX");
    expect(lookupStockKey("英伟达")).toBe("NVDA");
    expect(lookupStockKey("海力士")).toBe("HYNIX");
  });

  it("builds index rows from latest report period holdings only", () => {
    const holdings: FundHolding[] = [
      { fundCode: "539002", stockCode: "NVDA", stockName: "英伟达", navPercent: 8, reportPeriod: "2025Q4", source: "eastmoney-f10-jjcc", syncRunId: "run-1" },
      { fundCode: "539002", stockCode: "NVDA", stockName: "英伟达", navPercent: 11.5, reportPeriod: "2026Q1", source: "eastmoney-f10-jjcc", syncRunId: "run-1" },
      { fundCode: "513100", stockCode: "NVDA", stockName: "NVIDIA Corp", navPercent: 9.2, reportPeriod: "2026Q1", source: "eastmoney-f10-jjcc", syncRunId: "run-1" }
    ];

    expect(buildStockFundIndexRows(holdings)).toEqual([
      expect.objectContaining({ stockKey: "NVDA", fundCode: "539002", navPercent: 11.5, reportPeriod: "2026Q1" }),
      expect.objectContaining({ stockKey: "NVDA", fundCode: "513100", navPercent: 9.2, reportPeriod: "2026Q1" })
    ]);
  });
});
