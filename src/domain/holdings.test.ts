import { describe, expect, it } from "vitest";
import { matchesStockTarget } from "./holdings";

describe("holding stock matching", () => {
  it("matches disclosed English and Chinese names for NVDA", () => {
    expect(matchesStockTarget({ targetCode: "NVDA", stockCode: "NVDA", stockName: "NVIDIA Corp" })).toBe(true);
    expect(matchesStockTarget({ targetCode: "NVDA", stockCode: "", stockName: "英伟达" })).toBe(true);
  });

  it("matches featured stock aliases", () => {
    expect(matchesStockTarget({ targetCode: "AAPL", stockCode: "", stockName: "Apple Inc" })).toBe(true);
    expect(matchesStockTarget({ targetCode: "GOOG", stockCode: "GOOGL", stockName: "Alphabet" })).toBe(true);
    expect(matchesStockTarget({ targetCode: "MU", stockCode: "MU", stockName: "Micron Technology" })).toBe(true);
    expect(matchesStockTarget({ targetCode: "AVGO", stockCode: "AVGO", stockName: "Broadcom" })).toBe(true);
    expect(matchesStockTarget({ targetCode: "AMD", stockCode: "AMD", stockName: "Advanced Micro Devices" })).toBe(true);
    expect(matchesStockTarget({ targetCode: "TSM", stockCode: "TSM", stockName: "台积电" })).toBe(true);
    expect(matchesStockTarget({ targetCode: "HYNIX", stockCode: "", stockName: "SK海力士" })).toBe(true);
  });

  it("does not match unrelated stocks", () => {
    expect(matchesStockTarget({ targetCode: "NVDA", stockCode: "AAPL", stockName: "Apple Inc" })).toBe(false);
  });
});
