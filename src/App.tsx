import { useCallback, useEffect, useMemo, useState } from "react";
import { INDEX_TARGETS } from "./domain/targets";
import type { Target } from "./domain/types";
import type { StockConcentrationRow, SyncStatusMap } from "./db/repositories";
import { fetchIndexComparison, fetchLivePremium, fetchStockConcentration, fetchSyncStatus, fetchTargets, type LivePremiumRow } from "./api/client";
import { DataStatus } from "./ui/DataStatus";
import { IndexComparison } from "./ui/IndexComparison";
import { StockConcentration } from "./ui/StockConcentration";
import { TargetSelector } from "./ui/TargetSelector";

export function App() {
  const [data, setData] = useState<{ onExchange: any[]; offExchange: any[] } | null>(null);
  const [indexTargets, setIndexTargets] = useState<Target[]>(INDEX_TARGETS);
  const [selectedIndexTarget, setSelectedIndexTarget] = useState("NASDAQ_100");
  const [syncStatus, setSyncStatus] = useState<SyncStatusMap | null>(null);
  const [selectedStock, setSelectedStock] = useState("NVDA");
  const [stockRows, setStockRows] = useState<StockConcentrationRow[]>([]);
  const [livePremiums, setLivePremiums] = useState<Record<string, LivePremiumRow>>({});
  const [liveAsOf, setLiveAsOf] = useState<string | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  const selectedIndexTargetName = useMemo(() => {
    return indexTargets.find((target) => target.code === selectedIndexTarget)?.name ?? selectedIndexTarget;
  }, [indexTargets, selectedIndexTarget]);

  useEffect(() => {
    fetchTargets()
      .then((targets) => {
        const nextIndexTargets = targets
          .filter((target) => target.type === "index")
          .sort((a, b) => a.displayOrder - b.displayOrder);
        if (nextIndexTargets.length > 0) setIndexTargets(nextIndexTargets);
      })
      .catch(() => setIndexTargets(INDEX_TARGETS));
  }, []);

  useEffect(() => {
    let isCurrent = true;
    setData(null);
    setLivePremiums({});
    setLiveAsOf(null);
    setLiveError(null);
    fetchIndexComparison(selectedIndexTarget)
      .then((nextData) => {
        if (isCurrent) setData(nextData);
      })
      .catch(() => {
        if (isCurrent) setData(fallbackIndexComparison(selectedIndexTarget));
      });
    return () => {
      isCurrent = false;
    };
  }, [selectedIndexTarget]);

  const refreshLivePremium = useCallback(() => {
    setLiveLoading(true);
    setLiveError(null);
    fetchLivePremium(selectedIndexTarget)
      .then((response) => {
        const byCode: Record<string, LivePremiumRow> = {};
        for (const row of response.rows) byCode[row.fundCode] = row;
        setLivePremiums(byCode);
        setLiveAsOf(response.asOf);
      })
      .catch((error: unknown) => {
        setLiveError(error instanceof Error ? error.message : "实时刷新失败");
      })
      .finally(() => setLiveLoading(false));
  }, [selectedIndexTarget]);

  useEffect(() => {
    fetchSyncStatus()
      .then(setSyncStatus)
      .catch(() => setSyncStatus(null));
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
      <DataStatus status={syncStatus} />
      <TargetSelector targets={indexTargets} selectedTargetCode={selectedIndexTarget} onSelectTarget={setSelectedIndexTarget} />
      {data ? (
        <IndexComparison
          targetName={selectedIndexTargetName}
          data={data}
          livePremiums={livePremiums}
          liveAsOf={liveAsOf}
          liveLoading={liveLoading}
          liveError={liveError}
          onRefreshLive={refreshLivePremium}
        />
      ) : <p>加载中...</p>}
      <StockConcentration selectedStock={selectedStock} rows={stockRows} onSelectStock={setSelectedStock} />
    </main>
  );
}

function fallbackIndexComparison(targetCode: string): { onExchange: any[]; offExchange: any[] } {
  if (targetCode !== "NASDAQ_100") return { onExchange: [], offExchange: [] };
  return {
    onExchange: [{ code: "513100", name: "纳指ETF", closePrice: 1.23, closingPremiumDiscountRate: 0.012, turnover: 120000000, tradeDate: "2026-06-08", source: "mock" }],
    offExchange: [{ code: "000834", name: "纳指100联接A", shareClass: "A", status: "limited", limitAmountYuan: 1000, limitUnit: "per_day", channelScope: "agency", source: "mock" }]
  };
}
