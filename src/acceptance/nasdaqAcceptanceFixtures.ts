import type { Fund } from "../domain/types";

const QDII_INDEX = "指数型-海外股票";

/** Representative Nasdaq 100 universe for acceptance tests (not the production catalog). */
export const NASDAQ_ACCEPTANCE_FUNDS: Fund[] = [
  onExchangeEtf("159941", "纳指ETF广发", "广发基金"),
  onExchangeEtf("159696", "纳指ETF易方达", "易方达基金"),
  onExchangeEtf("159501", "纳指ETF嘉实", "嘉实基金"),
  onExchangeEtf("159659", "纳斯达克100ETF招商", "招商基金"),
  onExchangeEtf("159632", "纳斯达克ETF华安", "华安基金"),
  onExchangeEtf("159660", "纳指ETF汇添富", "汇添富基金"),
  onExchangeEtf("159513", "纳斯达克100ETF大成", "大成基金"),
  onExchangeEtf("513100", "纳指ETF", "国泰基金"),
  onExchangeEtf("513300", "纳斯达克ETF华夏", "华夏基金"),
  onExchangeEtf("513110", "纳指ETF华泰柏瑞", "华泰柏瑞基金"),
  onExchangeEtf("513390", "纳指100ETF博时", "博时基金"),
  onExchangeEtf("513870", "纳指ETF富国", "富国基金"),
  offExchangeShare("040046", "华安纳斯达克100ETF联接(QDII)A", "A", "华安基金", "159632"),
  offExchangeShare("014978", "华安纳斯达克100ETF联接(QDII)C", "C", "华安基金", "159632"),
  offExchangeShare("000834", "大成纳斯达克100ETF联接(QDII)A", "A", "大成基金", "159513"),
  offExchangeShare("016452", "南方纳斯达克100指数发起(QDII)A", "A", "南方基金")
];

function onExchangeEtf(code: string, name: string, fundCompany: string): Fund {
  return { code, name, fundType: QDII_INDEX, venue: "on_exchange", fundCompany, trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true };
}

function offExchangeShare(
  code: string,
  name: string,
  shareClass: "A" | "C",
  fundCompany: string,
  parentFundCode?: string
): Fund {
  return { code, name, fundType: QDII_INDEX, venue: "off_exchange", fundCompany, trackingTargetCode: "NASDAQ_100", shareClass, parentFundCode, enabled: true };
}
