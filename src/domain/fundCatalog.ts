import type { Fund } from "./types";

const QDII_INDEX = "指数型-海外股票";

/**
 * Structural catalog: direct-channel I/F shares, cross-listed LOFs, and parent links.
 * Product discovery (ETF screener + F10 + fundcode search) owns breadth; this list
 * only pins fields that discovery cannot infer reliably.
 */
export const INDEX_FUND_CATALOG: Record<string, Fund[]> = {
  NASDAQ_100: [
    onExchangeLof("161130", "易方达纳斯达克100ETF联接(QDII-LOF)A", "易方达基金", "NASDAQ_100", "159696"),
    onExchangeLof("160213", "国泰纳斯达克100指数(QDII-LOF)", "国泰基金", "NASDAQ_100", "513100"),
    offExchangeShare("021000", "南方纳斯达克100指数发起(QDII)I", "I", "南方基金", "NASDAQ_100", "016452"),
    offExchangeShare("021778", "广发纳斯达克100ETF联接(QDII)人民币F", "F", "广发基金", "NASDAQ_100", "159941"),
    offExchangeShare("021838", "嘉实纳斯达克100ETF发起联接(QDII)I人民币", "I", "嘉实基金", "NASDAQ_100", "159501"),
    offExchangeShare("022664", "华泰柏瑞纳斯达克100ETF发起式联接(QDII)I", "I", "华泰柏瑞基金", "NASDAQ_100", "513110"),
    offExchangeShare("024237", "博时纳斯达克100ETF发起式联接(QDII)I人民币", "I", "博时基金", "NASDAQ_100", "513390")
  ]
};

/** Anchor fund codes per target — used only to bias name search, not as coverage guarantees. */
export const INDEX_TARGET_ANCHOR_SEEDS: Record<string, string[]> = {
  NASDAQ_100: ["513100", "159632"],
  SP_500: ["513500"],
  NIKKEI_225: ["513880", "513520", "513000"],
  HSTECH: ["513180", "513010"]
};

/** All structural catalog funds flattened. */
export const CATALOG_FUNDS: Fund[] = Object.values(INDEX_FUND_CATALOG).flat();

/** Curated off-exchange I/F shares that require fund-company direct-channel limit rows. */
export const CATALOG_DIRECT_SHARE_FUNDS: Fund[] = CATALOG_FUNDS.filter(
  (fund) => fund.venue === "off_exchange" && (fund.shareClass === "I" || fund.shareClass === "F")
);

/** @deprecated Use INDEX_TARGET_ANCHOR_SEEDS — kept for callers expecting catalog codes map shape. */
export const INDEX_FUND_CATALOG_CODES: Record<string, string[]> = INDEX_TARGET_ANCHOR_SEEDS;

function onExchangeLof(code: string, name: string, fundCompany: string, trackingTargetCode: string, parentFundCode?: string): Fund {
  return { code, name, fundType: QDII_INDEX, venue: "on_exchange", fundCompany, trackingTargetCode, shareClass: "LOF", parentFundCode, enabled: true };
}

function offExchangeShare(
  code: string,
  name: string,
  shareClass: "A" | "C" | "F" | "I" | "E" | "Y" | "D" | "O",
  fundCompany: string,
  trackingTargetCode: string,
  parentFundCode?: string
): Fund {
  return { code, name, fundType: QDII_INDEX, venue: "off_exchange", fundCompany, trackingTargetCode, shareClass, parentFundCode, enabled: true };
}
