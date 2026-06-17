import type { Target } from "../domain/types";
import type { StockConcentrationMeta, StockConcentrationResult, StockConcentrationRow, SyncStatusMap } from "../db/repositories";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8787";

export async function fetchTargets(): Promise<Target[]> {
  const response = await fetch(`${API_BASE}/api/targets`);
  if (!response.ok) throw new Error(`Failed to fetch targets: ${response.status}`);
  return response.json();
}

export async function fetchIndexComparison(targetCode: string): Promise<{ onExchange: any[]; offExchange: any[] }> {
  const response = await fetch(`${API_BASE}/api/index-comparison/${targetCode}`);
  if (!response.ok) throw new Error(`Failed to fetch index comparison: ${response.status}`);
  return response.json();
}

export async function fetchStockConcentration(stockCode: string, options: { expandPeers?: boolean } = {}): Promise<StockConcentrationResult> {
  const query = options.expandPeers ? "?expandPeers=1" : "";
  const response = await fetch(`${API_BASE}/api/stock-concentration/${stockCode}${query}`);
  if (!response.ok) throw new Error(`Failed to fetch stock concentration: ${response.status}`);
  return response.json();
}

export async function fetchSyncStatus(): Promise<SyncStatusMap> {
  const response = await fetch(`${API_BASE}/api/status`);
  if (!response.ok) throw new Error(`Failed to fetch sync status: ${response.status}`);
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
  iopvSource: "current" | "trade_date_match" | "none";
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
  offExchange: Array<Record<string, unknown>>;
  syncStatus: SyncStatusMap;
}

export async function fetchSyncLimits(targetCode: string): Promise<SyncLimitsResponse> {
  const response = await fetch(`${API_BASE}/api/sync-limits/${targetCode}`, { method: "POST" });
  if (!response.ok) throw new Error(`Failed to sync off-exchange limits: ${response.status}`);
  return response.json();
}
