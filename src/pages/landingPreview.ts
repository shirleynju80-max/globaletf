import { formatPercent } from "../domain/fees";

export const LANDING_INDEX_PREVIEW_TARGET = "NASDAQ_100";
export const LANDING_STOCK_PREVIEW_CODE = "NVDA";
const PREVIEW_ROW_COUNT = 3;

export interface LandingIndexPreviewRow {
  code: string;
  name: string;
  premium: string;
  closing: string;
  tail: string;
}

export interface LandingStockPreviewRow {
  code: string;
  name: string;
  navPercent: string;
  kind: string;
  period: string;
}

export interface IndexComparisonPreviewInput {
  code: string;
  name: string;
  closingPremiumDiscountRate?: number | null;
  iopvPremiumDiscountRate?: number | null;
  turnover?: number | null;
}

export interface LivePremiumPreviewInput {
  iopvPremiumDiscountRate?: number | null;
}

export interface StockConcentrationPreviewInput {
  fundCode: string;
  fundName: string;
  navPercent: number;
  fundKind?: string | null;
  reportPeriod: string;
}

export const FALLBACK_INDEX_PREVIEW_ROWS: LandingIndexPreviewRow[] = [
  { code: "513100", name: "纳指ETF", premium: "+0.71%", closing: "+1.20%", tail: "12.0 亿" },
  { code: "159632", name: "纳斯达克ETF华安", premium: "+0.45%", closing: "+0.90%", tail: "3.2 亿" },
  { code: "159659", name: "纳指100ETF", premium: "+0.38%", closing: "+0.85%", tail: "2.8 亿" }
];

export const FALLBACK_STOCK_PREVIEW_ROWS: LandingStockPreviewRow[] = [
  { code: "161128", name: "易方达标普信息科技", navPercent: "20.16%", kind: "主动/QDII", period: "2026Q1" },
  { code: "539002", name: "建信新兴市场混合", navPercent: "10.14%", kind: "主动/QDII", period: "2026Q1" },
  { code: "513100", name: "纳指ETF", navPercent: "9.20%", kind: "纳指100", period: "2026Q1" }
];

export function buildIndexPreviewRows(
  onExchange: IndexComparisonPreviewInput[],
  livePremiums: Record<string, LivePremiumPreviewInput> = {}
): LandingIndexPreviewRow[] {
  const withPremium = onExchange.filter((row) => resolveLivePremiumRate(row, livePremiums) != null);
  const pool = withPremium.length > 0 ? withPremium : onExchange;
  const sorted = [...pool].sort((left, right) => {
    const leftRate = resolveLivePremiumRate(left, livePremiums);
    const rightRate = resolveLivePremiumRate(right, livePremiums);
    if (leftRate == null && rightRate == null) return compareTurnover(right, left);
    if (leftRate == null) return 1;
    if (rightRate == null) return -1;
    const diff = rightRate - leftRate;
    return diff !== 0 ? diff : left.code.localeCompare(right.code);
  });

  return sorted.slice(0, PREVIEW_ROW_COUNT).map((row) => ({
    code: row.code,
    name: shortenPreviewName(row.name),
    premium: formatSignedPercent(resolveLivePremiumRate(row, livePremiums)),
    closing: formatSignedPercent(row.closingPremiumDiscountRate),
    tail: formatTurnoverBrief(row.turnover)
  }));
}

export function buildStockPreviewRows(rows: StockConcentrationPreviewInput[]): LandingStockPreviewRow[] {
  return rows.slice(0, PREVIEW_ROW_COUNT).map((row) => ({
    code: row.fundCode,
    name: shortenPreviewName(row.fundName),
    navPercent: `${row.navPercent.toFixed(2)}%`,
    kind: row.fundKind ?? "主动/QDII",
    period: row.reportPeriod
  }));
}

function resolveLivePremiumRate(
  row: IndexComparisonPreviewInput,
  livePremiums: Record<string, LivePremiumPreviewInput>
): number | null | undefined {
  return livePremiums[row.code]?.iopvPremiumDiscountRate ?? row.iopvPremiumDiscountRate;
}

function compareTurnover(left: IndexComparisonPreviewInput, right: IndexComparisonPreviewInput): number {
  return (left.turnover ?? 0) - (right.turnover ?? 0);
}

function formatSignedPercent(rate: number | null | undefined): string {
  if (rate == null) return "-";
  const text = formatPercent(rate);
  return rate > 0 ? `+${text}` : text;
}

function formatTurnoverBrief(value?: number | null): string {
  if (value == null) return "-";
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)} 亿`;
  if (value >= 10000) return `${(value / 10000).toFixed(1)} 万`;
  return `${value.toLocaleString("zh-CN")} 元`;
}

function shortenPreviewName(name: string): string {
  const compact = name
    .replace(/\(QDII[^)]*\)/gi, "")
    .replace(/发起式?/g, "")
    .replace(/\s+/g, "")
    .trim();
  return compact.length > 12 ? `${compact.slice(0, 12)}…` : compact;
}
