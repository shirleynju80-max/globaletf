import { calculateClosingPremiumDiscount } from "../domain/quotes";
import type { Fund, FundQuote } from "../domain/types";
import type { DataProvider } from "./types";

const SOURCE = "eastmoney-on-exchange-quote";
const SPOT_SOURCE = "eastmoney-on-exchange-spot";

interface ProviderOptions {
  fetchImpl?: typeof fetch;
  dataDate?: string;
  syncRunId?: string;
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
  const rows = (payload as { data?: { diff?: Array<Record<string, unknown>> } }).data?.diff ?? [];
  const tradeDate = previousCalendarDate(dataDate);

  return rows.flatMap((row) => {
    const fundCode = String(row.f12 ?? "");
    const closePrice = Number(row.f18);
    if (!fundCode || !Number.isFinite(closePrice)) return [];
    return [{
      fundCode,
      closePrice,
      tradeDate
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
      const quotes: FundQuote[] = [];

      const onExchangeFunds = funds.filter((item) => item.enabled && item.venue === "on_exchange");

      for (const fund of onExchangeFunds) {
        try {
          const kline = await fetchKline(fetchImpl, fund.code, dataDate);
          const nav = await safeFetchNav(fetchImpl, fund.code);
          quotes.push({
            fundCode: fund.code,
            closePrice: kline.closePrice,
            turnover: kline.turnover,
            tradeDate: kline.tradeDate,
            closingPremiumDiscountRate: calculateClosingPremiumDiscount({
              closePrice: kline.closePrice,
              unitNav: nav?.unitNav ?? 0,
              tradeDate: kline.tradeDate,
              navDate: nav?.navDate ?? ""
            }),
            source: SOURCE,
            syncRunId
          });
        } catch {
          continue;
        }
      }

      if (quotes.length === 0) {
        quotes.push(...await fetchSpotQuotes(fetchImpl, onExchangeFunds, dataDate, syncRunId));
      }

      if (quotes.length === 0) return { ok: false, errorCategory: "missing_fields", message: "No on-exchange quotes fetched" };
      const latestDate = quotes.map((quote) => quote.tradeDate).sort().at(-1) ?? new Date().toISOString().slice(0, 10);
      return { ok: true, data: quotes, source: quotes[0]?.source ?? SOURCE, dataDate: latestDate, confidence: 0.85 };
    }
  };
}

async function fetchSpotQuotes(fetchImpl: typeof fetch, funds: Fund[], dataDate: string, syncRunId: string): Promise<FundQuote[]> {
  const params = new URLSearchParams({
    fltt: "2",
    secids: funds.map((fund) => eastMoneySecid(fund.code)).join(","),
    fields: "f12,f14,f6,f18"
  });
  const response = await fetchImpl(`https://push2.eastmoney.com/api/qt/ulist.np/get?${params.toString()}`, {
    headers: { "User-Agent": "Mozilla/5.0 ETFLimit/0.1", Referer: "https://fund.eastmoney.com/" }
  });
  if (!response.ok) return [];

  return parseEastMoneySpotQuotes(await response.json(), dataDate).map((quote) => ({
    fundCode: quote.fundCode,
    closePrice: quote.closePrice,
    turnover: quote.turnover,
    tradeDate: quote.tradeDate,
    closingPremiumDiscountRate: null,
    source: SPOT_SOURCE,
    syncRunId
  }));
}

async function fetchKline(fetchImpl: typeof fetch, code: string, beforeDate: string): Promise<KlineLatest> {
  const params = new URLSearchParams({
    secid: eastMoneySecid(code),
    ut: "fa5fd1943c7b386f172d6893dbfba10b",
    fields1: "f1,f2,f3,f4,f5,f6",
    fields2: "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
    klt: "101",
    fqt: "1",
    end: "20500101",
    lmt: "2"
  });
  const response = await fetchImpl(`https://push2his.eastmoney.com/api/qt/stock/kline/get?${params.toString()}`, {
    headers: { "User-Agent": "Mozilla/5.0 ETFLimit/0.1", Referer: "https://fund.eastmoney.com/" }
  });
  if (!response.ok) throw new Error(`kline returned ${response.status}`);
  return parseEastMoneyKlineLatest(await response.json(), beforeDate);
}

async function fetchNav(fetchImpl: typeof fetch, code: string): Promise<NavLatest> {
  const params = new URLSearchParams({ type: "lsjz", code, page: "1", per: "3" });
  const response = await fetchImpl(`https://fundf10.eastmoney.com/F10DataApi.aspx?${params.toString()}`, {
    headers: { "User-Agent": "Mozilla/5.0 ETFLimit/0.1", Referer: "https://fundf10.eastmoney.com/" }
  });
  if (!response.ok) throw new Error(`nav returned ${response.status}`);
  return parseEastMoneyNavLatest(await response.text());
}

async function safeFetchNav(fetchImpl: typeof fetch, code: string): Promise<NavLatest | null> {
  try {
    return await fetchNav(fetchImpl, code);
  } catch {
    return null;
  }
}

function decodeEscapedHtml(value: string): string {
  return value.replace(/\\"/g, "\"").replace(/\\'/g, "'").replace(/\\\//g, "/");
}

function normalizeText(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function previousCalendarDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}
