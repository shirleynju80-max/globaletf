import { useState, type FormEvent } from "react";
import type { StockConcentrationRow } from "../db/repositories";
import { lookupStockKey } from "../domain/stockHoldingIndex";
import { STOCK_TARGETS, findTargetByCode } from "../domain/targets";
import {
  matchesStockConcentrationFilters,
  toggleStockConcentrationFilter,
  type StockConcentrationFilterKey
} from "./stockConcentrationFilters";

const FILTER_OPTIONS: Array<{ key: StockConcentrationFilterKey; label: string }> = [
  { key: "purchasable", label: "可申购" },
  { key: "on_exchange", label: "场内" },
  { key: "off_exchange", label: "场外" }
];

interface Props {
  selectedStock: string;
  rows: StockConcentrationRow[];
  expandPeers: boolean;
  onSelectStock: (stockCode: string) => void;
  onExpandPeersChange: (expandPeers: boolean) => void;
}

export function StockConcentration({ selectedStock, rows, expandPeers, onSelectStock, onExpandPeersChange }: Props) {
  const [customStock, setCustomStock] = useState("");
  const [activeFilters, setActiveFilters] = useState<StockConcentrationFilterKey[]>([]);
  const filteredRows = (rows ?? []).filter((row) => matchesStockConcentrationFilters(row, activeFilters));

  function submitCustomStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = customStock.trim();
    if (!input) return;
    const target = findTargetByCode(input);
    onSelectStock(target?.code ?? lookupStockKey(input));
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

      <div className="stock-selector">
        <div className="segmented-control stock-picker" aria-label="选择股票">
          {STOCK_TARGETS.map((stock) => (
            <button
              key={stock.code}
              className={stock.code === selectedStock ? "active" : ""}
              type="button"
              onClick={() => onSelectStock(stock.code)}
            >
              {stock.name}
            </button>
          ))}
        </div>
        <form className="stock-search" onSubmit={submitCustomStock}>
          <label htmlFor="custom-stock">股票名称/代码</label>
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
      <p className="query-chip">当前查询：{formatSelectedStockLabel(selectedStock)}</p>
      <div className="segmented-control stock-filter" aria-label="筛选持仓基金">
        <button
          type="button"
          className={activeFilters.length === 0 ? "active" : ""}
          aria-pressed={activeFilters.length === 0}
          onClick={() => setActiveFilters([])}
        >
          全部
        </button>
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.key}
            className={activeFilters.includes(option.key) ? "active" : ""}
            type="button"
            aria-pressed={activeFilters.includes(option.key)}
            onClick={() => setActiveFilters((current) => toggleStockConcentrationFilter(current, option.key))}
          >
            {option.label}
          </button>
        ))}
      </div>
      <label className="dedupe-toggle">
        <input
          type="checkbox"
          checked={expandPeers}
          onChange={(event) => onExpandPeersChange(event.target.checked)}
        />
        展开全部同类指数产品
      </label>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>排名</th>
              <th className="col-name">基金</th>
              <th>类型</th>
              <th>份额</th>
              <th>市场</th>
              <th>持仓股票</th>
              <th>净值占比</th>
              <th>申购状态</th>
              <th>限额</th>
              <th>报告期</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={10}>暂无 {formatSelectedStockLabel(selectedStock)} 持仓数据</td>
              </tr>
            ) : (
              filteredRows.map((row, index) => (
                <tr key={`${row.fundCode}-${row.stockCode}-${row.reportPeriod}`}>
                  <td>{index + 1}</td>
                  <td className="col-name">
                    <span className="mono">{row.fundCode}</span> {row.fundName}
                  </td>
                  <td>{row.fundKind ?? "—"}</td>
                  <td>{row.shareClass}</td>
                  <td>{formatVenue(row.venue)}</td>
                  <td>{row.stockCode || row.stockName}</td>
                  <td>{formatNavPercent(row.navPercent)}</td>
                  <td>{formatPurchaseStatus(row)}</td>
                  <td>{formatLimit(row)}</td>
                  <td>{row.reportPeriod}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatSelectedStockLabel(stockCode: string): string {
  const target = findTargetByCode(stockCode);
  if (target) return `${target.name} (${target.code})`;
  return stockCode;
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

function formatPurchaseStatus(row: { purchaseStatus?: string | null; venue?: string; shareClass?: string }): string {
  if (row.purchaseStatus === "limited") return "限购";
  if (row.purchaseStatus === "open") return "开放";
  if (row.purchaseStatus === "suspended") return "暂停";
  if (row.venue === "on_exchange" && row.shareClass === "ETF") return "场内交易";
  if (row.venue === "on_exchange" && row.shareClass === "LOF") return "—";
  return "—";
}

function formatLimit(row: {
  purchaseStatus?: string | null;
  limitAmountYuan?: number | null;
  limitUnit?: string | null;
  venue?: string;
  shareClass?: string;
}): string {
  if (row.limitAmountYuan != null) return `${formatCurrency(row.limitAmountYuan)}${formatLimitUnit(row.limitUnit)}`;
  if (row.purchaseStatus === "open") return "开放申购";
  if (row.purchaseStatus === "limited") return "限额待确认";
  if (row.purchaseStatus === "suspended") return "暂停申购";
  if (row.venue === "on_exchange" && row.shareClass === "ETF") return "场内交易";
  return "—";
}

function formatLimitUnit(unit?: string | null): string {
  if (unit === "per_day") return "/日";
  if (unit === "per_order") return "/笔";
  return "";
}
