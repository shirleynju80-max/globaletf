import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INDEX_TARGETS } from "../domain/targets";
import type { Target } from "../domain/types";
import { SITE_NAME } from "../lib/brand";
import { LIMITS_INITIAL_DELAY_MS, LIMITS_REFRESH_INTERVAL_MS } from "../ui/liveLimitsRefresh";
import { fetchIndexComparison, fetchLivePremium, fetchSyncLimits, fetchTargets, type LivePremiumRow } from "../api/client";
import type { IndexComparisonResult } from "../db/repositories";
import { IndexComparison } from "../ui/IndexComparison";
import { SiteShell } from "../ui/SiteShell";
import { TargetSelector } from "../ui/TargetSelector";
import {
  codesMissingLivePremium,
  LIVE_MISSING_RETRY_DELAY_MS,
  LIVE_REFRESH_INTERVAL_MS,
  mergeLivePremiumMap
} from "../ui/livePremiumRefresh";

interface RefreshLiveOptions {
  fundCodes?: string[];
}

export function IndexPage() {
  const [data, setData] = useState<IndexComparisonResult | null>(null);
  const [indexTargets, setIndexTargets] = useState<Target[]>(INDEX_TARGETS);
  const [selectedIndexTarget, setSelectedIndexTarget] = useState("NASDAQ_100");
  const [livePremiums, setLivePremiums] = useState<Record<string, LivePremiumRow>>({});
  const [liveAsOf, setLiveAsOf] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [limitsError, setLimitsError] = useState<string | null>(null);
  const liveInFlightRef = useRef(false);
  const limitsInFlightRef = useRef(false);
  const missingRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onExchangeRef = useRef<IndexComparisonResult["onExchange"]>([]);
  onExchangeRef.current = data?.onExchange ?? [];
  const livePremiumsRef = useRef<Record<string, LivePremiumRow>>({});
  livePremiumsRef.current = livePremiums;

  const selectedIndexTargetName = useMemo(() => {
    return indexTargets.find((target) => target.code === selectedIndexTarget)?.name ?? selectedIndexTarget;
  }, [indexTargets, selectedIndexTarget]);

  useEffect(() => {
    document.title = `指数跟踪 · ${SITE_NAME}`;
    return () => {
      document.title = SITE_NAME;
    };
  }, []);

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
    setLimitsError(null);
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
      setLimitsError(null);
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

  return (
    <SiteShell
      active="indices"
      eyebrow="Index tracking"
      title="指数跟踪"
      lead="对比同一境外指数下的场内 ETF/LOF 折溢价、场外申购限额与费率，支持纳斯达克100、标普500、日经225、恒生科技等标的。"
    >
      <TargetSelector targets={indexTargets} selectedTargetCode={selectedIndexTarget} onSelectTarget={setSelectedIndexTarget} />
      {data ? (
        <IndexComparison
          targetName={selectedIndexTargetName}
          data={data}
          livePremiums={livePremiums}
          liveAsOf={liveAsOf}
          liveError={liveError}
          limitsError={limitsError}
        />
      ) : (
        <p className="site-loading">加载中...</p>
      )}
    </SiteShell>
  );
}

function fallbackIndexComparison(targetCode: string): IndexComparisonResult {
  if (targetCode !== "NASDAQ_100") return { onExchange: [], offExchange: [] };
  return {
    onExchange: [{
      code: "513100",
      name: "纳指ETF",
      venue: "on_exchange",
      shareClass: "ETF",
      closePrice: 1.23,
      closingPremiumDiscountRate: 0.012,
      turnover: 120000000,
      tradeDate: "2026-06-08",
      source: "mock"
    }],
    offExchange: [{
      code: "000834",
      name: "纳指100联接A",
      venue: "off_exchange",
      shareClass: "A",
      closingPremiumDiscountRate: null,
      status: "limited",
      limitAmountYuan: 1000,
      limitUnit: "per_day",
      channelScope: "agency",
      source: "mock"
    }]
  };
}
