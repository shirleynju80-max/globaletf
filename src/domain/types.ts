export type TargetType = "index" | "stock";
export type ProductVenue = "on_exchange" | "off_exchange";
export type ShareClass = "A" | "C" | "F" | "ETF" | "LOF" | "UNKNOWN";
export type ChannelScope = "agency" | "direct" | "special" | "unknown";
export type PurchaseStatus = "open" | "limited" | "suspended" | "unknown";
export type FeeType = "subscription" | "redemption" | "management" | "custodian" | "sales_service";

export interface Target {
  code: string;
  name: string;
  type: TargetType;
  aliases: string[];
  region: string;
  displayOrder: number;
}

export interface Fund {
  code: string;
  name: string;
  fundType: string;
  venue: ProductVenue;
  fundCompany?: string;
  trackingTargetCode?: string;
  shareClass: ShareClass;
  parentFundCode?: string;
  enabled: boolean;
}

export interface FundQuote {
  fundCode: string;
  closePrice: number;
  closingPremiumDiscountRate: number | null;
  unitNav?: number | null;
  navDate?: string | null;
  turnover?: number;
  tradeDate: string;
  source: string;
  syncRunId: string;
}

export interface PurchaseLimit {
  fundCode: string;
  shareClass: ShareClass;
  status: PurchaseStatus;
  limitAmountYuan?: number;
  limitUnit?: "per_day" | "per_order" | "unknown";
  channelScope: ChannelScope;
  source: string;
  dataDate: string;
  confidence: number;
  syncRunId: string;
}

export interface FeeTier {
  fundCode: string;
  feeType: FeeType;
  rate: number;
  minHoldingDays?: number;
  maxHoldingDays?: number;
  amountTierLowerBound?: number;
  amountTierUpperBound?: number;
  channelScope: ChannelScope;
  source: string;
  dataDate: string;
  syncRunId: string;
}

export interface FundHolding {
  fundCode: string;
  stockCode: string;
  stockName: string;
  navPercent: number;
  holdingMarketValue?: number;
  reportPeriod: string;
  source: string;
  syncRunId: string;
}
