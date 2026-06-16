import type { Target } from "../domain/types";
import type { StockConcentrationRow, SyncStatusMap } from "../db/repositories";

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

export async function fetchStockConcentration(stockCode: string): Promise<StockConcentrationRow[]> {
  const response = await fetch(`${API_BASE}/api/stock-concentration/${stockCode}`);
  if (!response.ok) throw new Error(`Failed to fetch stock concentration: ${response.status}`);
  return response.json();
}

export async function fetchSyncStatus(): Promise<SyncStatusMap> {
  const response = await fetch(`${API_BASE}/api/status`);
  if (!response.ok) throw new Error(`Failed to fetch sync status: ${response.status}`);
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

export async function fetchLivePremium(targetCode: string): Promise<LivePremiumResponse> {
  const response = await fetch(`${API_BASE}/api/live-premium/${targetCode}`);
  if (!response.ok) throw new Error(`Failed to fetch live premium: ${response.status}`);
  return response.json();
}
