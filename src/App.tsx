import { useEffect, useState } from "react";
import type { StockConcentrationRow } from "./db/repositories";
import { fetchIndexComparison, fetchStockConcentration } from "./api/client";
import { DataStatus } from "./ui/DataStatus";
import { IndexComparison } from "./ui/IndexComparison";
import { StockConcentration } from "./ui/StockConcentration";

export function App() {
  const [data, setData] = useState<{ onExchange: any[]; offExchange: any[] } | null>(null);
  const [selectedStock, setSelectedStock] = useState("NVDA");
  const [stockRows, setStockRows] = useState<StockConcentrationRow[]>([]);

  useEffect(() => {
    fetchIndexComparison("NASDAQ_100")
      .then(setData)
      .catch(() => {
        setData({
          onExchange: [{ code: "513100", name: "纳指ETF", closePrice: 1.23, closingPremiumDiscountRate: 0.012, turnover: 120000000, tradeDate: "2026-06-08", source: "mock" }],
          offExchange: [{ code: "000834", name: "纳指100联接A", shareClass: "A", status: "limited", limitAmountYuan: 1000, channelScope: "agency", source: "mock" }]
        });
      });
  }, []);

  useEffect(() => {
    fetchStockConcentration(selectedStock)
      .then(setStockRows)
      .catch(() => {
        setStockRows([
          {
            fundCode: "513100",
            fundName: "纳指ETF",
            venue: "on_exchange",
            shareClass: "ETF",
            stockCode: selectedStock,
            stockName: selectedStock,
            navPercent: selectedStock === "NVDA" ? 8.5 : 0,
            reportPeriod: "2026Q1",
            source: "mock"
          }
        ]);
      });
  }, [selectedStock]);

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">ETF Limit</p>
        <h1>境外标的基金成本与限购雷达</h1>
        <p>比较同一标的下的场内折溢价、场外 A/C/F 限额和费率，并查看热门海外股票持仓浓度。</p>
      </header>
      <DataStatus />
      {data ? <IndexComparison targetName="纳斯达克100" data={data} /> : <p>加载中...</p>}
      <StockConcentration selectedStock={selectedStock} rows={stockRows} onSelectStock={setSelectedStock} />
    </main>
  );
}
