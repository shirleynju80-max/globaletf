import { useState, type FormEvent } from "react";
import type { StockConcentrationRow } from "../db/repositories";

const STOCK_OPTIONS = ["NVDA", "AAPL", "MSFT", "TSLA", "META"];

interface Props {
  selectedStock: string;
  rows: StockConcentrationRow[];
  onSelectStock: (stockCode: string) => void;
}

export function StockConcentration({ selectedStock, rows, onSelectStock }: Props) {
  const [customStock, setCustomStock] = useState("");

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
              <th>报告期</th>
              <th>来源</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8}>暂无 {selectedStock} 持仓数据</td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={`${row.fundCode}-${row.stockCode}-${row.reportPeriod}`}>
                  <td>{index + 1}</td>
                  <td>
                    <span className="mono">{row.fundCode}</span> {row.fundName}
                  </td>
                  <td>{row.shareClass}</td>
                  <td>{formatVenue(row.venue)}</td>
                  <td>{row.stockCode || row.stockName}</td>
                  <td>{formatNavPercent(row.navPercent)}</td>
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

function formatVenue(venue: string): string {
  if (venue === "on_exchange") return "场内";
  if (venue === "off_exchange") return "场外";
  return "未知";
}

function formatNavPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}
