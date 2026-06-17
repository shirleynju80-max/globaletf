import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INDEX_TARGETS } from "./domain/targets";
import type { Target } from "./domain/types";
import type { StockConcentrationMeta, StockConcentrationRow, SyncStatusMap } from "./db/repositories";
import { LIMITS_INITIAL_DELAY_MS, LIMITS_REFRESH_INTERVAL_MS } from "./ui/liveLimitsRefresh";
import { fetchDiscoveryHealth, fetchIndexComparison, fetchLivePremium, fetchStockConcentration, fetchSyncLimits, fetchSyncStatus, fetchTargets, type DiscoveryHealthSummary, type LivePremiumRow } from "./api/client";
import { DataStatus } from "./ui/DataStatus";
import { IndexComparison } from "./ui/IndexComparison";
import { StockConcentration } from "./ui/StockConcentration";
import { TargetSelector } from "./ui/TargetSelector";
import {
  codesMissingLivePremium,
  LIVE_MISSING_RETRY_DELAY_MS,
  LIVE_REFRESH_INTERVAL_MS,
  mergeLivePremiumMap
} from "./ui/livePremiumRefresh";

interface IndexComparisonData {
  onExchange: Array<{ code: string; iopvPremiumDiscountRate?: number | null; [key: string]: unknown }>;
  offExchange: Array<Record<string, unknown>>;
}

export function App() {
  const [data, setData] = useState<IndexComparisonData | null>(null);
  const [indexTargets, setIndexTargets] = useState<Target[]>(INDEX_TARGETS);
  const [selectedIndexTarget, setSelectedIndexTarget] = useState("NASDAQ_100");
  const [syncStatus, setSyncStatus] = useState<SyncStatusMap | null>(null);
  const [selectedStock, setSelectedStock] = useState("NVDA");
  const [expandStockPeers, setExpandStockPeers] = useState(false);
  const [stockRows, setStockRows] = useState<StockConcentrationRow[]>([]);
  const [stockMeta, setStockMeta] = useState<StockConcentrationMeta | null>(null);
  const [livePremiums, setLivePremiums] = useState<Record<string, LivePremiumRow>>({});
  const [liveAsOf, setLiveAsOf] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [limitsAsOf, setLimitsAsOf] = useState<string | null>(null);
  const [limitsError, setLimitsError] = useState<string | null>(null);
  const [discoveryHealth, setDiscoveryHealth] = useState<DiscoveryHealthSummary | null>(null);
  const liveInFlightRef = useRef(false);
  const limitsInFlightRef = useRef(false);
  const missingRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onExchangeRef = useRef<IndexComparisonData["onExchange"]>([]);
  onExchangeRef.current = data?.onExchange ?? [];
  const livePremiumsRef = useRef<Record<string, LivePremiumRow>>({});
  livePremiumsRef.current = livePremiums;

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
    setLimitsAsOf(null);
    setLimitsError(null);
    setDiscoveryHealth(null);
    if (missingRetryTimerRef.current) {
      clearTimeout(missingRetryTimerRef.current);
      missingRetryTimerRef.current = null;
    }
    fetchIndexComparison(selectedIndexTarget)
      .then((nextData) => {
        if (isCurrent) setData(nextData);
      })
      .catch(() => {
        if (isCurrent) setData(fallbackIndexComparison(selectedIndexTarget));
      });
    fetchDiscoveryHealth(selectedIndexTarget)
      .then((health) => {
        if (isCurrent) setDiscoveryHealth(health);
      })
      .catch(() => {
        if (isCurrent) setDiscoveryHealth(null);
      });
    return () => {
      isCurrent = false;
    };
  }, [selectedIndexTarget]);

  const scheduleMissingPremiumRetry = useCallback((fundCodes: string[]) => {
    if (fundCodes.length === 0) return;
    if (missingRetryTimerRef.current) clearTimeout(missingRetryTimerRef.current);
    missingRetryTimerRef.current = setTimeout(() => {
      missingRetryTimerRef.current = null;
      void refreshLivePremiumRef.current?.({ fundCodes });
    }, LIVE_MISSING_RETRY_DELAY_MS);
  }, []);

  const refreshLivePremiumRef = useRef<((options?: RefreshLiveOptions) => Promise<void>) | null>(null);

  const refreshLivePremium = useCallback(async (options: RefreshLiveOptions = {}) => {
    if (liveInFlightRef.current) return;
    liveInFlightRef.current = true;
    try {
      const response = await fetchLivePremium(selectedIndexTarget, options.fundCodes);
      const merged = mergeLivePremiumMap(livePremiumsRef.current, response.rows);
      livePremiumsRef.current = merged;
      setLivePremiums(merged);
      setLiveAsOf(response.asOf);
      setLiveError(null);
      if (!options.fundCodes?.length) {
        scheduleMissingPremiumRetry(codesMissingLivePremium(onExchangeRef.current, merged));
      }
    } catch (error: unknown) {
      setLiveError(error instanceof Error ? error.message : "实时折溢价更新失败");
    } finally {
      liveInFlightRef.current = false;
    }
  }, [scheduleMissingPremiumRetry, selectedIndexTarget]);

  refreshLivePremiumRef.current = refreshLivePremium;

  const refreshOffExchangeLimits = useCallback(async () => {
    if (limitsInFlightRef.current || !data) return;
    limitsInFlightRef.current = true;
    try {
      const response = await fetchSyncLimits(selectedIndexTarget);
      setData((current) => current ? { ...current, offExchange: response.offExchange } : current);
      setLimitsAsOf(response.asOf);
      setLimitsError(null);
      setSyncStatus(response.syncStatus);
    } catch (error: unknown) {
      setLimitsError(error instanceof Error ? error.message : "场外限额刷新失败");
    } finally {
      limitsInFlightRef.current = false;
    }
  }, [data, selectedIndexTarget]);

  useEffect(() => {
    if (!data?.offExchange.length) return;

    const initialTimer = window.setTimeout(() => {
      if (document.visibilityState === "hidden") return;
      void refreshOffExchangeLimits();
    }, LIMITS_INITIAL_DELAY_MS);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void refreshOffExchangeLimits();
    }, LIMITS_REFRESH_INTERVAL_MS);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalId);
    };
  }, [data?.offExchange.length, refreshOffExchangeLimits]);

  useEffect(() => {
    if (!data?.onExchange.length) return;

    void refreshLivePremium();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void refreshLivePremium();
    }, LIVE_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      if (missingRetryTimerRef.current) {
        clearTimeout(missingRetryTimerRef.current);
        missingRetryTimerRef.current = null;
      }
    };
  }, [data, refreshLivePremium]);

  useEffect(() => {
    fetchSyncStatus()
      .then(setSyncStatus)
      .catch(() => setSyncStatus(null));
  }, []);

  useEffect(() => {
    fetchStockConcentration(selectedStock, { expandPeers: expandStockPeers })
      .then((result) => {
        setStockRows(result.rows);
        setStockMeta(result.meta);
      })
      .catch(() => {
        setStockMeta(null);
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
          discoveryHealth={discoveryHealth}
          livePremiums={livePremiums}
          liveAsOf={liveAsOf}
          liveError={liveError}
          limitsAsOf={limitsAsOf}
          limitsError={limitsError}
        />
      ) : <p>加载中...</p>}
      <StockConcentration
        selectedStock={selectedStock}
        rows={stockRows}
        meta={stockMeta}
        expandPeers={expandStockPeers}
        onSelectStock={setSelectedStock}
        onExpandPeersChange={setExpandStockPeers}
      />
    </main>
  );
}

interface RefreshLiveOptions {
  fundCodes?: string[];
}

function fallbackIndexComparison(targetCode: string): IndexComparisonData {
  if (targetCode !== "NASDAQ_100") return { onExchange: [], offExchange: [] };
  return {
    onExchange: [{ code: "513100", name: "纳指ETF", closePrice: 1.23, closingPremiumDiscountRate: 0.012, turnover: 120000000, tradeDate: "2026-06-08", source: "mock" }],
    offExchange: [{ code: "000834", name: "纳指100联接A", shareClass: "A", status: "limited", limitAmountYuan: 1000, limitUnit: "per_day", channelScope: "agency", source: "mock" }]
  };
}
