import type { FeeTier, Fund, FundHolding, FundQuote, PurchaseLimit } from "../domain/types";

export const mockFunds: Fund[] = [
  { code: "513100", name: "纳指ETF", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true },
  { code: "000834", name: "纳指100联接A", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "A", parentFundCode: "000834", enabled: true },
  { code: "016532", name: "纳指100联接C", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "C", parentFundCode: "000834", enabled: true },
  { code: "020123", name: "纳指100联接F", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "F", parentFundCode: "000834", enabled: true }
];

export const mockQuotes: FundQuote[] = [
  { fundCode: "513100", closePrice: 1.23, closingPremiumDiscountRate: 0.012, turnover: 120000000, tradeDate: "2026-06-08", source: "eastmoney", syncRunId: "mock-run" }
];

export const mockLimits: PurchaseLimit[] = [
  { fundCode: "000834", shareClass: "A", status: "limited", limitAmountYuan: 1000, limitUnit: "per_day", channelScope: "agency", source: "tiantian", dataDate: "2026-06-09", confidence: 0.9, syncRunId: "mock-run" },
  { fundCode: "016532", shareClass: "C", status: "limited", limitAmountYuan: 1000, limitUnit: "per_day", channelScope: "agency", source: "tiantian", dataDate: "2026-06-09", confidence: 0.9, syncRunId: "mock-run" },
  { fundCode: "020123", shareClass: "F", status: "limited", limitAmountYuan: 10000, limitUnit: "per_day", channelScope: "direct", source: "tiantian", dataDate: "2026-06-09", confidence: 0.85, syncRunId: "mock-run" }
];

export const mockFees: FeeTier[] = [];
export const mockHoldings: FundHolding[] = [
  { fundCode: "513100", stockCode: "NVDA", stockName: "英伟达", navPercent: 8.5, reportPeriod: "2026Q1", source: "eastmoney", syncRunId: "mock-run" }
];
