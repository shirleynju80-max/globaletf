import { selectActiveQdiiFundsForStockScan } from "../domain/stockScanSelection";
import type { Fund } from "../domain/types";
import { mergeFundSearchRowsByCode } from "./eastmoneyEtfScreener";
import { fetchEastMoneyFundCodeRows, fetchEastMoneyFundSuggestionsForQueries } from "./eastmoneyFundSearch";

const BROAD_STOCK_SCAN_QUERIES = [
  "QDII混合",
  "QDII股票",
  "全球精选",
  "新兴市场",
  "全球科技",
  "半导体"
];

export interface DiscoverStockScanFundsOptions {
  fetchImpl?: typeof fetch;
}

/** Name-based supplement only; holdings discovery uses full QDII jjcc scan + stock_fund_index. */
export function stockScanSearchQueries(): string[] {
  return [...BROAD_STOCK_SCAN_QUERIES];
}

export async function discoverStockScanFunds(options: DiscoverStockScanFundsOptions = {}): Promise<Fund[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const [codeRows, suggestionRows] = await Promise.all([
    fetchEastMoneyFundCodeRows(fetchImpl),
    fetchEastMoneyFundSuggestionsForQueries(fetchImpl, stockScanSearchQueries())
  ]);
  const merged = mergeFundSearchRowsByCode([...codeRows, ...suggestionRows]);
  return selectActiveQdiiFundsForStockScan(merged);
}
