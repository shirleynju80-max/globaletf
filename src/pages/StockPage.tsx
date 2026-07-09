import { useEffect, useState } from "react";
import type { StockConcentrationRow } from "../db/repositories";
import type { FundReturnSnapshot } from "../domain/fundReturnPeriods";
import { SITE_NAME } from "../lib/brand";
import { fetchFundReturns, fetchStockConcentration } from "../api/client";
import { SiteShell } from "../ui/SiteShell";
import { StockConcentration } from "../ui/StockConcentration";

export function StockPage() {
  const [selectedStock, setSelectedStock] = useState("NVDA");
  const [expandStockPeers, setExpandStockPeers] = useState(false);
  const [stockRows, setStockRows] = useState<StockConcentrationRow[] | null>(null);
  const [returnsByCode, setReturnsByCode] = useState<Record<string, FundReturnSnapshot | undefined>>({});
  const [returnsLoading, setReturnsLoading] = useState(false);

  useEffect(() => {
    document.title = `股票持仓 · ${SITE_NAME}`;
    return () => {
      document.title = SITE_NAME;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;
    setStockRows(null);
    setReturnsByCode({});
    setReturnsLoading(false);

    fetchStockConcentration(selectedStock, { expandPeers: expandStockPeers })
      .then((result) => {
        if (!isCurrent) return;
        const rows = result.rows ?? [];
        setStockRows(rows);
        if (rows.length === 0) return;

        setReturnsLoading(true);
        return fetchFundReturns(rows).then((returns) => {
          if (!isCurrent) return;
          setReturnsByCode(returns);
        });
      })
      .catch(() => {
        if (!isCurrent) return;
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
      })
      .finally(() => {
        if (isCurrent) setReturnsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedStock, expandStockPeers]);

  return (
    <SiteShell
      active="stocks"
      eyebrow="Holdings concentration"
      title="热门股票持仓浓度"
      lead="持仓来自基金定期报告，不代表实时持仓。支持查询 NVDA、AAPL 等热门海外股票在 QDII 与 ETF 中的净值占比；主动产品全量展示，同质指数产品默认折叠。涨跌幅为近一周至一年区间表现，场内用收盘价、场外用披露净值。"
    >
      {stockRows == null ? (
        <p className="site-loading">加载中...</p>
      ) : (
        <StockConcentration
          selectedStock={selectedStock}
          rows={stockRows}
          returnsByCode={returnsByCode}
          returnsLoading={returnsLoading}
          expandPeers={expandStockPeers}
          onSelectStock={setSelectedStock}
          onExpandPeersChange={setExpandStockPeers}
        />
      )}
    </SiteShell>
  );
}
