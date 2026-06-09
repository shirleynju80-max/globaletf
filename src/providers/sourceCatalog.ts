export type ParsingMode = "json" | "js_wrapped_json" | "html" | "library_adapter";

export interface SourceDescriptor {
  name: string;
  endpointPattern: string;
  parsingMode: ParsingMode;
  provides: string[];
  notes: string;
}

export const OFF_EXCHANGE_SOURCES: SourceDescriptor[] = [
  {
    name: "tiantian-f10-jjfl",
    endpointPattern: "https://fundf10.eastmoney.com/jjfl_{code}.html",
    parsingMode: "html",
    provides: ["purchase_status", "purchase_limit_text", "subscription_fee_tiers", "redemption_fee_tiers", "management_fee", "custodian_fee", "sales_service_fee"],
    notes: "Primary off-exchange source. Parse carefully because fee and limit text can be table or free text."
  },
  {
    name: "eastmoney-fundcode-search",
    endpointPattern: "https://fund.eastmoney.com/js/fundcode_search.js",
    parsingMode: "js_wrapped_json",
    provides: ["fund_universe", "fund_name", "fund_type", "share_class_hint"],
    notes: "Use for initial fund universe and share-class suffix inference."
  },
  {
    name: "eastmoney-f10-lsjz-status",
    endpointPattern: "https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz&code={code}&page=1&per=1",
    parsingMode: "js_wrapped_json",
    provides: ["subscribe_status", "redeem_status", "nav_date"],
    notes: "Fallback status cross-check. Do not silently override newer detail-page data when dates differ."
  }
];

export const ON_EXCHANGE_SOURCES: SourceDescriptor[] = [
  {
    name: "akshare-eastmoney-etf-lof-hist",
    endpointPattern: "ak.fund_etf_hist_em(symbol, period='daily', adjust='') / ak.fund_lof_hist_em(symbol, period='daily', adjust='')",
    parsingMode: "library_adapter",
    provides: ["close_price", "turnover", "trade_date"],
    notes: "Primary source for previous completed trading day close and turnover."
  },
  {
    name: "akshare-eastmoney-open-fund-nav",
    endpointPattern: "ak.fund_open_fund_info_em(symbol, indicator='单位净值走势')",
    parsingMode: "library_adapter",
    provides: ["unit_nav", "nav_date"],
    notes: "Use only when nav_date exactly matches trade_date; otherwise leave closing premium/discount null."
  },
  {
    name: "eastmoney-etf-spot-cross-check",
    endpointPattern: "ak.fund_etf_spot_em() / East Money push2delay clist",
    parsingMode: "library_adapter",
    provides: ["quote_screen_premium_discount", "latest_price", "turnover"],
    notes: "ETF-only lower-confidence cross-check. Do not use for intraday estimated NAV in the first release."
  }
];

export const HOLDING_SOURCES: SourceDescriptor[] = [
  {
    name: "akshare-eastmoney-fund-portfolio-hold",
    endpointPattern: "ak.fund_portfolio_hold_em(symbol='{fundCode}', date='{year}')",
    parsingMode: "library_adapter",
    provides: ["stock_code", "stock_name", "nav_percent", "holding_market_value", "report_period"],
    notes: "Primary holdings source for report-period concentration ranking. Match overseas stocks by code and alias."
  },
  {
    name: "eastmoney-f10-jjcc",
    endpointPattern: "https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code={code}&year={year}&topline=10",
    parsingMode: "js_wrapped_json",
    provides: ["stock_name", "nav_percent", "holding_market_value", "report_period"],
    notes: "Fallback holdings source with JS-wrapped HTML content."
  }
];
