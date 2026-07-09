import { computePeriodReturns, type FundReturnSnapshot } from "../domain/fundReturnPeriods";
import { fetchWithTimeout, mapConcurrent } from "./requestUtils";

export interface FundReturnRequest {
  fundCode: string;
  venue: "on_exchange" | "off_exchange";
}

interface FetchFundReturnsOptions {
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
  concurrency?: number;
  asOfDate?: string;
}

const NAV_PAGE_SIZE = 40;
const NAV_MAX_PAGES = 15;
const HISTORY_BUFFER_DAYS = 400;

export async function fetchFundReturnSnapshots(
  funds: FundReturnRequest[],
  options: FetchFundReturnsOptions = {}
): Promise<Record<string, FundReturnSnapshot>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.requestTimeoutMs ?? 12_000;
  const concurrency = options.concurrency ?? 6;
  const endDate = options.asOfDate ?? new Date().toISOString().slice(0, 10);
  const startDate = subtractDays(endDate, HISTORY_BUFFER_DAYS);

  const results = await mapConcurrent(funds, concurrency, async (fund) => {
    try {
      const series = fund.venue === "on_exchange"
        ? await fetchOnExchangeCloseSeries(fetchImpl, fund.fundCode, startDate, endDate, timeoutMs)
        : await fetchOffExchangeNavSeries(fetchImpl, fund.fundCode, timeoutMs, endDate);
      const snapshot = computePeriodReturns(series);
      if (!snapshot) return null;
      return { ...snapshot, fundCode: fund.fundCode };
    } catch {
      return null;
    }
  });

  const out: Record<string, FundReturnSnapshot> = {};
  for (const snapshot of results) {
    if (snapshot) out[snapshot.fundCode] = snapshot;
  }
  return out;
}

async function fetchOnExchangeCloseSeries(
  fetchImpl: typeof fetch,
  fundCode: string,
  startDate: string,
  endDate: string,
  timeoutMs: number
) {
  const symbol = tencentSymbol(fundCode);
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,${startDate},${endDate},500,qfq`;
  const response = await fetchWithTimeout(fetchImpl, url, {
    headers: { "User-Agent": "Mozilla/5.0 globaletf/0.1", Referer: "https://gu.qq.com/" }
  }, timeoutMs);
  if (!response.ok) throw new Error(`kline ${fundCode} ${response.status}`);
  const payload = await response.json() as { data?: Record<string, { day?: string[][] }> };
  const rows = payload.data?.[symbol]?.day ?? [];
  return rows
    .map((row) => ({ date: row[0], value: Number(row[2]) }))
    .filter((row) => row.date && Number.isFinite(row.value) && row.value > 0);
}

async function fetchOffExchangeNavSeries(
  fetchImpl: typeof fetch,
  fundCode: string,
  timeoutMs: number,
  endDate: string
) {
  const series: Array<{ date: string; value: number }> = [];
  const historyStart = subtractDays(endDate, HISTORY_BUFFER_DAYS);

  for (let page = 1; page <= NAV_MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      type: "lsjz",
      code: fundCode,
      page: String(page),
      per: String(NAV_PAGE_SIZE)
    });
    const response = await fetchWithTimeout(
      fetchImpl,
      `https://fundf10.eastmoney.com/F10DataApi.aspx?${params.toString()}`,
      { headers: { "User-Agent": "Mozilla/5.0 globaletf/0.1", Referer: "https://fundf10.eastmoney.com/" } },
      timeoutMs
    );
    if (!response.ok) throw new Error(`nav ${fundCode} ${response.status}`);
    const html = await response.text();
    let count = 0;
    for (const match of html.matchAll(/<td>(\d{4}-\d{2}-\d{2})<\/td><td[^>]*>([\d.]+)<\/td>/g)) {
      series.push({ date: match[1], value: Number(match[2]) });
      count += 1;
    }
    if (count === 0) break;

    const oldestDate = [...series].sort((a, b) => a.date.localeCompare(b.date))[0]?.date;
    if (oldestDate && oldestDate <= historyStart) break;
  }

  return dedupeDatedSeries(series);
}

function dedupeDatedSeries(series: Array<{ date: string; value: number }>) {
  const byDate = new Map<string, number>();
  for (const point of series) {
    if (point.date && Number.isFinite(point.value) && point.value > 0) {
      byDate.set(point.date, point.value);
    }
  }
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function tencentSymbol(fundCode: string): string {
  if (fundCode.startsWith("5")) return `sh${fundCode}`;
  return `sz${fundCode}`;
}

function subtractDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
