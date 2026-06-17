import { beijingDateFromMs } from "../domain/iopvAlignment";
import type { FundEstimate } from "./eastmoneyIopv";
import { eastMoneySecid } from "./eastmoneyOnExchangeQuotes";
import { fetchWithTimeout } from "./requestUtils";

/** East Money on-exchange quote row (`ulist.np`), aligned with the mobile app. */
export interface EastMoneyQuoteListRow {
  fundCode: string;
  /** Latest traded price (`f2`). */
  lastPrice: number | null;
  /** Previous close (`f18`). */
  previousClose: number | null;
  turnover: number | null;
  /** ETF IOPV / 实时估值 (`f441`) — same field as East Money app premium gauge. */
  iopv: number | null;
  priceTimeMs: number | null;
}

const QUOTE_LIST_HOSTS = ["https://push2.eastmoney.com", "https://push2delay.eastmoney.com"];
const QUOTE_LIST_FIELDS = "f12,f2,f6,f18,f124,f441";

export function parseEastMoneyQuoteListRows(payload: unknown): EastMoneyQuoteListRow[] {
  const rows = (payload as { data?: { diff?: Array<Record<string, unknown>> } }).data?.diff ?? [];
  return rows.flatMap((row) => {
    const fundCode = String(row.f12 ?? "");
    if (!fundCode) return [];
    const lastPrice = toPositiveNumber(row.f2);
    const previousClose = toPositiveNumber(row.f18);
    const turnover = Number(row.f6);
    const iopv = toPositiveNumber(row.f441);
    const epochSec = Number(row.f124);
    const priceTimeMs = Number.isFinite(epochSec) && epochSec > 0 ? epochSec * 1000 : null;
    return [{
      fundCode,
      lastPrice,
      previousClose,
      turnover: Number.isFinite(turnover) ? turnover : null,
      iopv,
      priceTimeMs
    }];
  });
}

export function iopvTimeFromQuoteSnapshot(priceTimeMs: number | null, fallbackDate?: string): string | null {
  if (priceTimeMs != null) return formatBeijingDateTime(priceTimeMs);
  if (fallbackDate) return `${fallbackDate} 15:00`;
  return null;
}

/** Prefer quote-list IOPV (`f441`), then fundgz / disclosed NAV fallback. */
export function mergeQuoteListIopv(
  quoteRow: EastMoneyQuoteListRow | null | undefined,
  fallback: FundEstimate | null,
  tradeDate?: string | null
): FundEstimate | null {
  if (quoteRow?.iopv != null) {
    return {
      fundCode: quoteRow.fundCode,
      unitNav: fallback?.unitNav ?? null,
      navDate: fallback?.navDate ?? null,
      iopv: quoteRow.iopv,
      iopvTime: iopvTimeFromQuoteSnapshot(quoteRow.priceTimeMs, tradeDate ?? undefined)
    };
  }
  return fallback;
}

export async function fetchEastMoneyQuoteListMap(
  fetchImpl: typeof fetch,
  codes: string[],
  timeoutMs = 12_000
): Promise<Map<string, EastMoneyQuoteListRow>> {
  if (codes.length === 0) return new Map();
  const params = new URLSearchParams({
    fltt: "2",
    secids: codes.map((code) => eastMoneySecid(code)).join(","),
    fields: QUOTE_LIST_FIELDS
  });
  for (const host of QUOTE_LIST_HOSTS) {
    try {
      const response = await fetchWithTimeout(
        fetchImpl,
        `${host}/api/qt/ulist.np/get?${params.toString()}`,
        { headers: { "User-Agent": "Mozilla/5.0 ETFLimit/0.1", Referer: "https://quote.eastmoney.com/" } },
        timeoutMs
      );
      if (!response.ok) continue;
      const map = new Map<string, EastMoneyQuoteListRow>();
      for (const row of parseEastMoneyQuoteListRows(await response.json())) {
        map.set(row.fundCode, row);
      }
      if (map.size > 0) return map;
    } catch {
      continue;
    }
  }
  return new Map();
}

/** Session close for sync: prefer latest price (`f2`), else previous close (`f18`). */
export function spotCloseFromQuoteRow(row: EastMoneyQuoteListRow, dataDate: string): {
  closePrice: number;
  turnover?: number;
  tradeDate: string;
} | null {
  const closePrice = row.lastPrice ?? row.previousClose;
  if (closePrice == null) return null;
  const tradeDate = row.lastPrice != null && row.priceTimeMs != null
    ? beijingDateFromMs(row.priceTimeMs)
    : previousCalendarDate(dataDate);
  return {
    closePrice,
    turnover: row.turnover ?? undefined,
    tradeDate
  };
}

function previousCalendarDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

function formatBeijingDateTime(ms: number): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date(ms));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`;
}

function toPositiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
