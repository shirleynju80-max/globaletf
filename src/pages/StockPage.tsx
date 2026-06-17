import { useEffect, useState } from "react";
import type { StockConcentrationRow } from "../db/repositories";
import { SITE_NAME } from "../lib/brand";
import { fetchStockConcentration } from "../api/client";
import { SiteShell } from "../ui/SiteShell";
import { StockConcentration } from "../ui/StockConcentration";

export function StockPage() {
  const [selectedStock, setSelectedStock] = useState("NVDA");
  const [expandStockPeers, setExpandStockPeers] = useState(false);
  const [stockRows, setStockRows] = useState<StockConcentrationRow[]>([]);

  useEffect(() => {
    document.title = `股票持仓 · ${SITE_NAME}`;
    return () => {
      document.title = SITE_NAME;
    };
  }, []);

  useEffect(() => {
    fetchStockConcentration(selectedStock, { expandPeers: expandStockPeers })
      .then((result) => {
        setStockRows(result.rows ?? []);
      })
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
  }, [selectedStock, expandStockPeers]);

  return (
    <SiteShell
      active="stocks"
      eyebrow="Holdings concentration"
      title="热门股票持仓浓度"
      lead="持仓来自基金定期报告，不代表实时持仓。支持查询 NVDA、AAPL 等热门海外股票在 QDII 与 ETF 中的净值占比；主动产品全量展示，同质指数产品默认折叠。"
    >
      <StockConcentration
        selectedStock={selectedStock}
        rows={stockRows}
        expandPeers={expandStockPeers}
        onSelectStock={setSelectedStock}
        onExpandPeersChange={setExpandStockPeers}
      />
    </SiteShell>
  );
}
