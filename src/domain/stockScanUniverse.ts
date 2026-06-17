import type { Fund } from "./types";

/** Curated non-index QDII seeds; live sync also discovers active QDII via stockHoldingFundDiscovery. */
export const STOCK_SCAN_FUNDS: Fund[] = [
  {
    code: "539002",
    name: "建信新兴市场混合(QDII)A",
    fundType: "QDII-混合偏股",
    venue: "off_exchange",
    fundCompany: "建信基金",
    trackingTargetCode: undefined,
    shareClass: "A",
    enabled: true
  }
];
