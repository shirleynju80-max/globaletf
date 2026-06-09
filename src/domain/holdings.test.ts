import { describe, expect, it } from "vitest";
import { matchesStockTarget } from "./holdings";

describe("holding stock matching", () => {
  it("matches disclosed English and Chinese names for NVDA", () => {
    expect(matchesStockTarget({ targetCode: "NVDA", stockCode: "NVDA", stockName: "NVIDIA Corp" })).toBe(true);
    expect(matchesStockTarget({ targetCode: "NVDA", stockCode: "", stockName: "英伟达" })).toBe(true);
  });

  it("matches the initial expanded stock universe by code and aliases", () => {
    expect(matchesStockTarget({ targetCode: "AAPL", stockCode: "", stockName: "Apple Inc" })).toBe(true);
    expect(matchesStockTarget({ targetCode: "MSFT", stockCode: "MSFT", stockName: "Microsoft Corp" })).toBe(true);
    expect(matchesStockTarget({ targetCode: "TSLA", stockCode: "", stockName: "特斯拉" })).toBe(true);
    expect(matchesStockTarget({ targetCode: "META", stockCode: "", stockName: "Meta Platforms Inc" })).toBe(true);
  });

  it("does not match unrelated stocks", () => {
    expect(matchesStockTarget({ targetCode: "NVDA", stockCode: "AAPL", stockName: "Apple Inc" })).toBe(false);
  });
});
