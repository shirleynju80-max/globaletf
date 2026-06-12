import { useState, type FormEvent } from "react";
import type { StockConcentrationRow } from "../db/repositories";

const STOCK_OPTIONS = ["NVDA", "AAPL", "MSFT", "TSLA", "META"];
const FILTER_OPTIONS = [
  { key: "all", label: "全部" },
  { key: "purchasable", label: "可申购" },
  { key: "on_exchange", label: "场内" },
  { key: "off_exchange", label: "场外" }
] as const;

type StockFilter = (typeof FILTER_OPTIONS)[number]["key"];

interface Props {
  selectedStock: string;
  rows: StockConcentrationRow[];
  onSelectStock: (stockCode: string) => void;
}

export function StockConcentration({ selectedStock, rows, onSelectStock }: Props) {
  const [customStock, setCustomStock] = useState("");
  const [filter, setFilter] = useState<StockFilter>("all");
  const filteredRows = rows.filter((row) => matchesFilter(row, filter));

  function submitCustomStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = customStock.trim().toUpperCase();
    if (!normalized) return;
    onSelectStock(normalized);
  }

  return (
    <section className="panel compact-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Holdings concentration</p>
          <h2>热门股票持仓浓度</h2>
        </div>
        <span className="source-pill">定期报告</span>
      </div>
      <p className="note">持仓来自基金定期报告，不代表实时持仓。第一版预设 NVDA、AAPL、MSFT、TSLA、META。</p>

      <div className="stock-selector">
        <div className="segmented-control" aria-label="选择股票">
          {STOCK_OPTIONS.map((stockCode) => (
            <button
              key={stockCode}
              className={stockCode === selectedStock ? "active" : ""}
              type="button"
              onClick={() => onSelectStock(stockCode)}
            >
              {stockCode}
            </button>
          ))}
        </div>
        <form className="stock-search" onSubmit={submitCustomStock}>
          <label htmlFor="custom-stock">自定义股票代码</label>
          <input
            id="custom-stock"
            value={customStock}
            onChange={(event) => setCustomStock(event.target.value)}
            placeholder="如 GOOG"
            autoCapitalize="characters"
          />
          <button type="submit">查询股票</button>
        </form>
      </div>
      <p className="query-chip">当前查询：{selectedStock}</p>
      <div className="segmented-control stock-filter" aria-label="筛选持仓基金">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.key}
            className={filter === option.key ? "active" : ""}
            type="button"
            onClick={() => setFilter(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>排名</th>
              <th>基金</th>
              <th>份额</th>
              <th>市场</th>
              <th>持仓股票</th>
              <th>净值占比</th>
              <th>持仓市值</th>
              <th>申购状态</th>
              <th>限额</th>
              <th>报告期</th>
              <th>来源</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={11}>暂无 {selectedStock} 持仓数据</td>
              </tr>
            ) : (
              filteredRows.map((row, index) => (
                <tr key={`${row.fundCode}-${row.stockCode}-${row.reportPeriod}`}>
                  <td>{index + 1}</td>
                  <td>
                    <span className="mono">{row.fundCode}</span> {row.fundName}
                  </td>
                  <td>{row.shareClass}</td>
                  <td>{formatVenue(row.venue)}</td>
                  <td>{row.stockCode || row.stockName}</td>
                  <td>{formatNavPercent(row.navPercent)}</td>
                  <td>{formatCurrency(row.holdingMarketValue)}</td>
                  <td>{formatPurchaseStatus(row.purchaseStatus)}</td>
                  <td>{formatLimit(row)}</td>
                  <td>{row.reportPeriod}</td>
                  <td>{row.source}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function matchesFilter(row: StockConcentrationRow, filter: StockFilter): boolean {
  if (filter === "on_exchange") return row.venue === "on_exchange";
  if (filter === "off_exchange") return row.venue === "off_exchange";
  if (filter === "purchasable") return row.venue === "on_exchange" || row.purchaseStatus === "open" || row.purchaseStatus === "limited";
  return true;
}

function formatVenue(venue: string): string {
  if (venue === "on_exchange") return "场内";
  if (venue === "off_exchange") return "场外";
  return "未知";
}

function formatNavPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatCurrency(value?: number | null): string {
  if (value == null) return "-";
  if (value >= 100000000) return `${(value / 100000000).toFixed(2)} 亿`;
  if (value >= 10000) return `${(value / 10000).toFixed(2)} 万`;
  return `${value.toLocaleString("zh-CN")} 元`;
}

function formatPurchaseStatus(status?: string | null): string {
  if (status === "limited") return "限购";
  if (status === "open") return "开放";
  if (status === "suspended") return "暂停";
  return "-";
}

function formatLimit(row: { purchaseStatus?: string | null; limitAmountYuan?: number | null; limitUnit?: string | null }): string {
  if (row.limitAmountYuan != null) return `${formatCurrency(row.limitAmountYuan)}${formatLimitUnit(row.limitUnit)}`;
  if (row.purchaseStatus === "open") return "开放申购";
  if (row.purchaseStatus === "limited") return "限额待确认";
  if (row.purchaseStatus === "suspended") return "暂停申购";
  return "-";
}

function formatLimitUnit(unit?: string | null): string {
  if (unit === "per_day") return "/日";
  if (unit === "per_order") return "/笔";
  return "";
}
