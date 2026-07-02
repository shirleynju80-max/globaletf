import type { Target } from "../domain/types";
import type { StockConcentrationMeta, StockConcentrationResult, StockConcentrationRow, SyncStatusMap, IndexComparisonResult, LandingStats } from "../db/repositories";

const API_BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? "http://127.0.0.1:8787" : "");

export async function fetchTargets(): Promise<Target[]> {
  const response = await fetch(`${API_BASE}/api/targets`);
  if (!response.ok) throw new Error(`Failed to fetch targets: ${response.status}`);
  return response.json();
}

export async function fetchIndexComparison(targetCode: string): Promise<IndexComparisonResult> {
  const response = await fetch(`${API_BASE}/api/index-comparison/${targetCode}`);
  if (!response.ok) throw new Error(`Failed to fetch index comparison: ${response.status}`);
  return response.json();
}

export async function fetchStockConcentration(stockCode: string, options: { expandPeers?: boolean } = {}): Promise<StockConcentrationResult> {
  const query = options.expandPeers ? "?expandPeers=1" : "";
  const response = await fetch(`${API_BASE}/api/stock-concentration/${stockCode}${query}`);
  if (!response.ok) throw new Error(`Failed to fetch stock concentration: ${response.status}`);
  const data = await response.json();
  return normalizeStockConcentrationResult(data);
}

function normalizeStockConcentrationResult(data: unknown): StockConcentrationResult {
  const emptyMeta: StockConcentrationMeta = {
    reportPeriod: null,
    dataSource: "fund_holdings",
    totalBeforeDedupe: 0,
    collapsedIndexPeers: 0
  };
  if (Array.isArray(data)) {
    return { rows: data, meta: { ...emptyMeta, totalBeforeDedupe: data.length } };
  }
  if (data && typeof data === "object") {
    const payload = data as Partial<StockConcentrationResult>;
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    return {
      rows,
      meta: payload.meta ?? { ...emptyMeta, totalBeforeDedupe: rows.length }
    };
  }
  return { rows: [], meta: emptyMeta };
}

export async function fetchSyncStatus(): Promise<SyncStatusMap> {
  const response = await fetch(`${API_BASE}/api/status`);
  if (!response.ok) throw new Error(`Failed to fetch sync status: ${response.status}`);
  return response.json();
}

export async function fetchLandingStats(): Promise<LandingStats> {
  const response = await fetch(`${API_BASE}/api/landing-stats`);
  if (!response.ok) throw new Error(`Failed to fetch landing stats: ${response.status}`);
  return response.json();
}

export interface DiscoveryHealthSummary {
  targetCode: string;
  manifestCount: number;
  onExchangeCount: number;
  profileBackedOnExchange: number;
  profileGaps: Array<{ targetCode: string; fundCode: string; venue: string }>;
  coverageGaps: string[];
}

export async function fetchDiscoveryHealth(targetCode: string): Promise<DiscoveryHealthSummary> {
  const response = await fetch(`${API_BASE}/api/discovery-health/${targetCode}`);
  if (!response.ok) throw new Error(`Failed to fetch discovery health: ${response.status}`);
  return response.json();
}

export interface LivePremiumRow {
  fundCode: string;
  name: string | null;
  price: number | null;
  priceTime: string | null;
  iopv: number | null;
  iopvTime: string | null;
  iopvPremiumDiscountRate: number | null;
  aligned: boolean | null;
  iopvSource: "current" | "trade_date_match" | "none" | "nav";
}

export interface LivePremiumResponse {
  asOf: string;
  rows: LivePremiumRow[];
}

export async function fetchLivePremium(targetCode: string, fundCodes?: string[]): Promise<LivePremiumResponse> {
  const query = fundCodes?.length ? `?codes=${fundCodes.join(",")}` : "";
  const response = await fetch(`${API_BASE}/api/live-premium/${targetCode}${query}`);
  if (!response.ok) throw new Error(`Failed to fetch live premium: ${response.status}`);
  return response.json();
}

export interface SyncLimitsResponse {
  asOf: string;
  offExchange: IndexComparisonResult["offExchange"];
  syncStatus: SyncStatusMap;
}

export async function fetchSyncLimits(targetCode: string): Promise<SyncLimitsResponse> {
  const response = await fetch(`${API_BASE}/api/sync-limits/${targetCode}`, { method: "POST" });
  if (!response.ok) throw new Error(`Failed to sync off-exchange limits: ${response.status}`);
  return response.json();
}
