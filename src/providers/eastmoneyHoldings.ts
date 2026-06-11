import type { Fund, FundHolding } from "../domain/types";
import type { DataProvider } from "./types";
import { mapConcurrent, withTimeout } from "./requestUtils";

const SOURCE = "eastmoney-f10-jjcc";
const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;

interface ParseInput {
  fundCode: string;
  html: string;
  syncRunId: string;
}

interface ProviderOptions {
  fetchImpl?: typeof fetch;
  dataDate?: string;
  years?: number[];
  syncRunId?: string;
  concurrency?: number;
  requestTimeoutMs?: number;
}

export function parseEastMoneyHoldingsPage(input: ParseInput): FundHolding[] {
  const content = extractApiContent(input.html);
  if (!content) return [];

  const sections = extractHoldingSections(content);
  return sections.flatMap((section) => {
    const reportPeriod = parseReportPeriod(section.title);
    if (!reportPeriod) return [];

    return extractRows(section.tableHtml).flatMap((cells) => {
      const stockCode = cells[1] ?? "";
      const stockName = cells[2] ?? "";
      const navPercent = parsePercent(cells[6] ?? "");
      if (!stockName || navPercent == null) return [];

      return [{
        fundCode: input.fundCode,
        stockCode,
        stockName,
        navPercent,
        holdingMarketValue: parseWanYuanToYuan(cells[8] ?? ""),
        reportPeriod,
        source: SOURCE,
        syncRunId: input.syncRunId
      }];
    });
  });
}

export function createEastMoneyHoldingsProvider(funds: Fund[], options: ProviderOptions = {}): DataProvider<FundHolding[]> {
  return {
    name: SOURCE,
    fetch: async () => {
      const fetchImpl = options.fetchImpl ?? fetch;
      const dataDate = options.dataDate ?? new Date().toISOString().slice(0, 10);
      const syncRunId = options.syncRunId ?? `eastmoney-holdings-${dataDate}`;
      const initialYears = options.years ?? [new Date().getFullYear(), new Date().getFullYear() - 1];
      const concurrency = options.concurrency ?? 4;

      try {
        const holdings = (await mapConcurrent(
          funds.filter((item) => item.enabled),
          concurrency,
          (fund) => fetchFundHoldings(fetchImpl, fund.code, initialYears, syncRunId, options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS)
        )).flat();

        if (holdings.length === 0) return { ok: false, errorCategory: "missing_fields", message: "No holdings parsed from East Money F10" };
        return { ok: true, data: holdings, source: SOURCE, dataDate, confidence: 0.8 };
      } catch (error) {
        return { ok: false, errorCategory: "network", message: error instanceof Error ? error.message : "Unknown holdings fetch error" };
      }
    }
  };
}

async function fetchFundHoldings(fetchImpl: typeof fetch, fundCode: string, initialYears: number[], syncRunId: string, requestTimeoutMs?: number): Promise<FundHolding[]> {
  const triedYears = new Set<number>();
  const queue = [...initialYears];

  while (queue.length > 0) {
    const year = queue.shift();
    if (!year || triedYears.has(year)) continue;
    triedYears.add(year);

    let html = "";
    try {
      html = await fetchHoldingPage(fetchImpl, fundCode, year, requestTimeoutMs);
    } catch {
      return [];
    }
    const holdings = parseEastMoneyHoldingsPage({ fundCode, html, syncRunId });
    if (holdings.length > 0) return holdings;

    for (const fallbackYear of extractApiYears(html).slice(0, 3)) {
      if (!triedYears.has(fallbackYear)) queue.push(fallbackYear);
    }
  }

  return [];
}

async function fetchHoldingPage(fetchImpl: typeof fetch, fundCode: string, year: number, requestTimeoutMs?: number): Promise<string> {
  const url = `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${fundCode}&year=${year}&topline=10`;
  const response = await withTimeout(fetchImpl(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 ETFLimit/0.1",
      Referer: `https://fundf10.eastmoney.com/ccmx_${fundCode}.html`
    }
  }), requestTimeoutMs);
  if (!response.ok) return "";
  return response.text();
}

function extractApiContent(html: string): string {
  return html.match(/content:"([\s\S]*?)",arryear:/)?.[1] ?? "";
}

function extractApiYears(html: string): number[] {
  const years = html.match(/arryear:\[([^\]]*)\]/)?.[1] ?? "";
  return years
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value));
}

function extractHoldingSections(html: string): Array<{ title: string; tableHtml: string }> {
  return [...html.matchAll(/<h4[^>]*>([\s\S]*?)<\/h4>[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/gi)].map((match) => ({
    title: normalizeText(match[1]),
    tableHtml: match[2]
  }));
}

function extractRows(html: string): string[][] {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => extractCells(row[1])).filter((cells) => cells.length >= 7);
}

function extractCells(html: string): string[] {
  return [...html.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => normalizeText(cell[1]));
}

function normalizeText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseReportPeriod(text: string): string | undefined {
  const match = text.match(/(\d{4})年(\d)季度/);
  return match ? `${match[1]}Q${match[2]}` : undefined;
}

function parsePercent(text: string): number | undefined {
  const match = text.match(/([\d.]+)%/);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function parseWanYuanToYuan(text: string): number | undefined {
  const value = Number(text.replace(/,/g, ""));
  return Number.isFinite(value) ? value * 10000 : undefined;
}
