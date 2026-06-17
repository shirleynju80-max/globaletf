import { calculateClosingPremiumDiscount, calculateIopvPremiumDiscount } from "../domain/quotes";
import type { Fund, FundQuote } from "../domain/types";
import type { FundEstimate } from "./eastmoneyIopv";
import {
  fetchEastMoneyQuoteListMap,
  mergeQuoteListIopv,
  parseEastMoneyQuoteListRows,
  spotCloseFromQuoteRow,
  type EastMoneyQuoteListRow
} from "./eastmoneyQuoteList";
import { fetchFundReferenceEstimate } from "./fundReferenceEstimate";
import { fetchWithTimeout, mapConcurrent } from "./requestUtils";
import type { DataProvider } from "./types";

const SOURCE = "eastmoney-on-exchange-quote";
const SPOT_SOURCE = "eastmoney-on-exchange-spot";
const LIVE_PRICE_HOSTS = ["https://push2.eastmoney.com", "https://push2delay.eastmoney.com"];
const KLINE_PATH = "/api/qt/stock/kline/get";
const KLINE_PRIMARY_UT = "fa5fd1943c7b386f172d6893dbfba10b";
const KLINE_ALTERNATE_UT = "7eea3edcaed734bea9cbfc24409ed989";

interface KlineFetchTarget {
  host: string;
  referer: string;
  ut: string;
}

/** Primary host with retry, then alternate referer/host/token combinations. */
const KLINE_FETCH_TARGETS: KlineFetchTarget[] = [
  { host: "https://push2his.eastmoney.com", referer: "https://quote.eastmoney.com/", ut: KLINE_PRIMARY_UT },
  { host: "https://push2his.eastmoney.com", referer: "https://quote.eastmoney.com/", ut: KLINE_PRIMARY_UT },
  { host: "https://push2his.eastmoney.com", referer: "https://fund.eastmoney.com/", ut: KLINE_PRIMARY_UT },
  { host: "http://push2his.eastmoney.com", referer: "https://quote.eastmoney.com/", ut: KLINE_PRIMARY_UT },
  { host: "https://push2his.eastmoney.com", referer: "https://quote.eastmoney.com/", ut: KLINE_ALTERNATE_UT }
];
const KLINE_RETRY_DELAY_MS = 400;

interface ProviderOptions {
  fetchImpl?: typeof fetch;
  dataDate?: string;
  syncRunId?: string;
  concurrency?: number;
  requestTimeoutMs?: number;
}

interface KlineLatest {
  closePrice: number;
  turnover: number;
  tradeDate: string;
}

interface NavLatest {
  navDate: string;
  unitNav: number;
}

interface SpotQuote {
  fundCode: string;
  closePrice: number;
  turnover?: number;
  tradeDate: string;
  quoteRow?: EastMoneyQuoteListRow;
}

export function eastMoneySecid(code: string): string {
  if (code.startsWith("5")) return `1.${code}`;
  return `0.${code}`;
}

export function parseEastMoneyKlineLatest(payload: unknown, beforeDate?: string): KlineLatest {
  const klines = (payload as { data?: { klines?: string[] } }).data?.klines ?? [];
  const eligible = beforeDate ? klines.filter((row) => row.slice(0, 10) < beforeDate) : klines;
  const latest = eligible.at(-1);
  if (!latest) throw new Error("Missing kline rows");
  const [tradeDate, , close, , , , amount] = latest.split(",");
  const closePrice = Number(close);
  const turnover = Number(amount);
  if (!tradeDate || !Number.isFinite(closePrice)) throw new Error("Invalid kline row");
  return { closePrice, turnover, tradeDate };
}

export function parseEastMoneyNavLatest(payload: string): NavLatest {
  const content = payload.match(/content\s*:\s*["']([\s\S]*?)["']\s*,/)?.[1] ?? payload;
  const text = decodeEscapedHtml(content);
  const cells = [...text.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => normalizeText(match[1]));
  const dateIndex = cells.findIndex((cell) => /^\d{4}-\d{2}-\d{2}$/.test(cell));
  if (dateIndex < 0) throw new Error("Missing NAV date");
  const unitNav = Number(cells.slice(dateIndex + 1).find((cell) => /^\d+(\.\d+)?$/.test(cell)));
  if (!Number.isFinite(unitNav)) throw new Error("Missing unit NAV");
  return { navDate: cells[dateIndex], unitNav };
}

export function parseEastMoneySpotQuotes(payload: unknown, dataDate: string): SpotQuote[] {
  return parseEastMoneyQuoteListRows(payload).flatMap((row) => {
    const spot = spotCloseFromQuoteRow(row, dataDate);
    if (!spot) return [];
    return [{
      fundCode: row.fundCode,
      closePrice: spot.closePrice,
      turnover: spot.turnover,
      tradeDate: spot.tradeDate,
      quoteRow: row
    }];
  });
}

export function createEastMoneyOnExchangeQuoteProvider(funds: Fund[], options: ProviderOptions = {}): DataProvider<FundQuote[]> {
  return {
    name: SOURCE,
    fetch: async () => {
      const fetchImpl = options.fetchImpl ?? fetch;
      const dataDate = options.dataDate ?? new Date().toISOString().slice(0, 10);
      const syncRunId = options.syncRunId ?? `eastmoney-quotes-${new Date().toISOString().slice(0, 10)}`;
      const concurrency = options.concurrency ?? 4;
      const timeoutMs = options.requestTimeoutMs ?? 12_000;
      const onExchangeFunds = funds.filter((item) => item.enabled && item.venue === "on_exchange");
      const fundCodes = onExchangeFunds.map((fund) => fund.code);
      const [spotByCode, quoteListByCode] = await Promise.all([
        fetchSpotQuoteMap(fetchImpl, onExchangeFunds, dataDate, timeoutMs),
        fetchEastMoneyQuoteListMap(fetchImpl, fundCodes, timeoutMs)
      ]);

      const quoteResults = await mapConcurrent(onExchangeFunds, concurrency, async (fund) => {
        const quoteRow = quoteListByCode.get(fund.code) ?? spotByCode.get(fund.code)?.quoteRow ?? null;
        const kline = await safeFetchPreviousDayKline(fetchImpl, fund.code, dataDate, timeoutMs);
        if (kline) {
          return buildQuote(fetchImpl, fund.code, {
            closePrice: kline.closePrice,
            turnover: kline.turnover,
            tradeDate: kline.tradeDate,
            source: SOURCE,
            syncRunId
          }, timeoutMs, quoteRow);
        }
        const spot = spotByCode.get(fund.code);
        if (!spot) return null;
        return buildQuote(fetchImpl, fund.code, {
          closePrice: spot.closePrice,
          turnover: undefined,
          tradeDate: spot.tradeDate,
          source: SPOT_SOURCE,
          syncRunId
        }, timeoutMs, quoteRow ?? spot.quoteRow ?? null);
      });

      const quotes = quoteResults.filter((quote): quote is FundQuote => quote != null);
      if (quotes.length === 0) return { ok: false, errorCategory: "missing_fields", message: "No on-exchange quotes fetched" };
      const latestDate = quotes.map((quote) => quote.tradeDate).sort().at(-1) ?? new Date().toISOString().slice(0, 10);
      const source = quotes.every((quote) => quote.source === SOURCE)
        ? SOURCE
        : quotes.every((quote) => quote.source === SPOT_SOURCE)
          ? SPOT_SOURCE
          : `${SOURCE}+${SPOT_SOURCE}`;
      return { ok: true, data: quotes, source, dataDate: latestDate, confidence: 0.85 };
    }
  };
}

async function buildQuote(
  fetchImpl: typeof fetch,
  fundCode: string,
  price: { closePrice: number; turnover?: number; tradeDate: string; source: string; syncRunId: string },
  timeoutMs: number,
  quoteRow: EastMoneyQuoteListRow | null = null
): Promise<FundQuote> {
  const fallback = await fetchFundReferenceEstimate(fetchImpl, fundCode, timeoutMs);
  const reference = mergeQuoteListIopv(quoteRow, fallback, price.tradeDate);
  const nav = await resolveNav(fetchImpl, fundCode, reference, timeoutMs);
  const iopv = reference?.iopv ?? null;
  return {
    fundCode,
    closePrice: price.closePrice,
    turnover: price.turnover,
    tradeDate: price.tradeDate,
    unitNav: nav?.unitNav ?? null,
    navDate: nav?.navDate ?? null,
    iopv,
    iopvTime: reference?.iopvTime ?? null,
    iopvPremiumDiscountRate: calculateIopvPremiumDiscount(price.closePrice, iopv),
    closingPremiumDiscountRate: calculateClosingPremiumDiscount({
      closePrice: price.closePrice,
      unitNav: nav?.unitNav ?? 0,
      tradeDate: price.tradeDate,
      navDate: nav?.navDate ?? ""
    }),
    source: price.source,
    syncRunId: price.syncRunId
  };
}

async function fetchSpotQuoteMap(
  fetchImpl: typeof fetch,
  funds: Fund[],
  dataDate: string,
  timeoutMs: number
): Promise<Map<string, SpotQuote>> {
  if (funds.length === 0) return new Map();
  const params = new URLSearchParams({
    fltt: "2",
    secids: funds.map((fund) => eastMoneySecid(fund.code)).join(","),
    fields: "f12,f14,f6,f18,f124,f441"
  });
  for (const host of LIVE_PRICE_HOSTS) {
    try {
      const response = await fetchWithTimeout(
        fetchImpl,
        `${host}/api/qt/ulist.np/get?${params.toString()}`,
        { headers: { "User-Agent": "Mozilla/5.0 ETFLimit/0.1", Referer: "https://quote.eastmoney.com/" } },
        timeoutMs
      );
      if (!response.ok) continue;
      const map = new Map<string, SpotQuote>();
      for (const quote of parseEastMoneySpotQuotes(await response.json(), dataDate)) {
        map.set(quote.fundCode, quote);
      }
      if (map.size > 0) return map;
    } catch {
      continue;
    }
  }
  return new Map();
}

/** Previous completed trading day close and full-day turnover from daily kline. */
export async function safeFetchPreviousDayKline(
  fetchImpl: typeof fetch,
  code: string,
  beforeDate: string,
  timeoutMs?: number
): Promise<KlineLatest | null> {
  for (let index = 0; index < KLINE_FETCH_TARGETS.length; index += 1) {
    if (index === 1) await sleep(KLINE_RETRY_DELAY_MS);
    try {
      return await fetchKline(fetchImpl, code, beforeDate, timeoutMs, KLINE_FETCH_TARGETS[index]);
    } catch {
      continue;
    }
  }
  return null;
}

async function fetchKline(
  fetchImpl: typeof fetch,
  code: string,
  beforeDate: string,
  timeoutMs: number | undefined,
  target: KlineFetchTarget
): Promise<KlineLatest> {
  const params = new URLSearchParams({
    secid: eastMoneySecid(code),
    ut: target.ut,
    fields1: "f1,f2,f3,f4,f5,f6",
    fields2: "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
    klt: "101",
    fqt: "1",
    end: "20500101",
    lmt: "2"
  });
  const response = await fetchWithTimeout(
    fetchImpl,
    `${target.host}${KLINE_PATH}?${params.toString()}`,
    { headers: { "User-Agent": "Mozilla/5.0 ETFLimit/0.1", Referer: target.referer } },
    timeoutMs
  );
  if (!response.ok) throw new Error(`kline returned ${response.status}`);
  return parseEastMoneyKlineLatest(await response.json(), beforeDate);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchNav(fetchImpl: typeof fetch, code: string, timeoutMs?: number): Promise<NavLatest> {
  const params = new URLSearchParams({ type: "lsjz", code, page: "1", per: "3" });
  const response = await fetchWithTimeout(
    fetchImpl,
    `https://fundf10.eastmoney.com/F10DataApi.aspx?${params.toString()}`,
    { headers: { "User-Agent": "Mozilla/5.0 ETFLimit/0.1", Referer: "https://fundf10.eastmoney.com/" } },
    timeoutMs
  );
  if (!response.ok) throw new Error(`nav returned ${response.status}`);
  return parseEastMoneyNavLatest(await response.text());
}

async function safeFetchNav(fetchImpl: typeof fetch, code: string, timeoutMs?: number): Promise<NavLatest | null> {
  try {
    return await fetchNav(fetchImpl, code, timeoutMs);
  } catch {
    return null;
  }
}

async function resolveNav(fetchImpl: typeof fetch, code: string, estimate: FundEstimate | null, timeoutMs?: number): Promise<NavLatest | null> {
  const nav = await safeFetchNav(fetchImpl, code, timeoutMs);
  if (nav) return nav;
  if (estimate?.unitNav != null && estimate.navDate) {
    return { unitNav: estimate.unitNav, navDate: estimate.navDate };
  }
  return null;
}

function decodeEscapedHtml(value: string): string {
  return value.replace(/\\"/g, "\"").replace(/\\'/g, "'").replace(/\\\//g, "/");
}

function normalizeText(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
