export type TargetType = "index" | "stock";
export type ProductVenue = "on_exchange" | "off_exchange";
export type ShareClass = "A" | "C" | "F" | "I" | "E" | "Y" | "D" | "O" | "ETF" | "LOF" | "UNKNOWN";
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
  /** How this fund entered the universe (fund sync / discovery manifest). */
  discoverySource?: string;
}

export interface FundQuote {
  fundCode: string;
  closePrice: number;
  closingPremiumDiscountRate: number | null;
  unitNav?: number | null;
  navDate?: string | null;
  /** Real-time estimated reference NAV (IOPV / 实时估值). */
  iopv?: number | null;
  /** Timestamp the IOPV estimate was published (e.g. "2026-06-13 04:00"). */
  iopvTime?: string | null;
  /** Premium/discount vs IOPV: the meaningful gauge for cross-border QDII funds. */
  iopvPremiumDiscountRate?: number | null;
  /** ISO timestamp of the price used for IOPV premium (A-share close or live quote). */
  priceTime?: string | null;
  /** Whether IOPV gztime is on/before price time without falling back to a prior snapshot. */
  iopvAligned?: boolean | null;
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
  /** Specific sales platform or fund-company direct channel. */
  channelId?: string;
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
  /** Specific sales platform or fund-company direct channel. */
  channelId?: string;
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
