import { matchesDiscoveryNameHint } from "../domain/fundDiscovery";
import type { Fund, ShareClass } from "../domain/types";
import type { DataProvider } from "./types";

const SOURCE = "eastmoney-fundcode-search";
const ENDPOINT = "https://fund.eastmoney.com/js/fundcode_search.js";
const SUGGEST_ENDPOINT = "https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx";

export interface FundSearchRow {
  code: string;
  shortName: string;
  name: string;
  type: string;
  pinyin: string;
  fundCompany?: string;
  otherName?: string;
}

export interface TargetSelection {
  targetCode: string;
  targetName: string;
  aliases: string[];
  seedFundCodes?: string[];
}

interface ProviderOptions extends TargetSelection {
  fetchImpl?: typeof fetch;
}

interface MultiTargetProviderOptions {
  targets: TargetSelection[];
  fetchImpl?: typeof fetch;
}

export function parseEastMoneyFundSearch(script: string): FundSearchRow[] {
  const jsonText = script.trim().replace(/^\uFEFF?var\s+r\s*=\s*/, "").replace(/;\s*$/, "");
  const rows = JSON.parse(jsonText) as string[][];
  return rows.map(([code, shortName, name, type, pinyin]) => ({ code, shortName, name, type, pinyin }));
}

export function parseEastMoneyFundSuggestions(payload: unknown): FundSearchRow[] {
  const rows = (payload as { Datas?: Array<Record<string, unknown>> }).Datas ?? [];
  return rows.flatMap((row) => {
    const base = row.FundBaseInfo as Record<string, unknown> | undefined;
    const code = String(row.CODE ?? row._id ?? base?.FCODE ?? "");
    const name = stripHtml(String(row.NAME ?? base?.SHORTNAME ?? ""));
    const pinyin = String(row.JP ?? "");
    const type = String(base?.FTYPE ?? "");
    if (!code || !name || !type) return [];
    return [{
      code,
      shortName: pinyin,
      name,
      type,
      pinyin,
      fundCompany: stringOrUndefined(base?.JJGS),
      otherName: String(base?.OTHERNAME ?? "")
    }];
  });
}

export function selectFundsForTarget(rows: FundSearchRow[], target: TargetSelection): Fund[] {
  const deduped = new Map<string, Fund>();
  for (const row of rows) {
    if (!matchesTarget(row, target) || isForeignCurrencyShare(row.name)) continue;
    const fund = toFund(row, target.targetCode);
    if (!fund) continue;
    const seeded = target.seedFundCodes?.includes(row.code);
    deduped.set(fund.code, {
      ...fund,
      discoverySource: seeded ? "catalog-seed" : fund.discoverySource ?? "fundcode-search"
    });
  }
  return [...deduped.values()].sort((a, b) => a.code.localeCompare(b.code));
}

export function selectFundsForTargets(rows: FundSearchRow[], targets: TargetSelection[]): Fund[] {
  return targets.flatMap((target) => selectFundsForTarget(rows, target));
}

export async function fetchEastMoneyFundCodeRows(fetchImpl: typeof fetch = fetch): Promise<FundSearchRow[]> {
  const response = await fetchImpl(ENDPOINT, {
    headers: {
      "User-Agent": "Mozilla/5.0 globaletf/0.1",
      Referer: "https://fund.eastmoney.com/"
    }
  });
  if (!response.ok) return [];
  return parseEastMoneyFundSearch(await response.text());
}

export function createEastMoneyFundSearchProvider(options: ProviderOptions): DataProvider<Fund[]> {
  return {
    name: SOURCE,
    fetch: async () => {
      const fetchImpl = options.fetchImpl ?? fetch;
      try {
        const rows = [
          ...await fetchEastMoneyFundCodeRows(fetchImpl),
          ...await fetchSuggestionRows(fetchImpl, [options])
        ];
        const funds = selectFundsForTarget(rows, options);
        if (funds.length === 0) return { ok: false, errorCategory: "missing_fields", message: `No funds matched ${options.targetCode}` };
        return { ok: true, data: funds, source: SOURCE, dataDate: new Date().toISOString().slice(0, 10), confidence: 0.75 };
      } catch (error) {
        return { ok: false, errorCategory: "network", message: error instanceof Error ? error.message : "Unknown fund search error" };
      }
    }
  };
}

export function createEastMoneyMultiTargetFundSearchProvider(options: MultiTargetProviderOptions): DataProvider<Fund[]> {
  return {
    name: SOURCE,
    fetch: async () => {
      const fetchImpl = options.fetchImpl ?? fetch;
      try {
        const rows = [
          ...await fetchEastMoneyFundCodeRows(fetchImpl),
          ...await fetchSuggestionRows(fetchImpl, options.targets)
        ];
        const funds = selectFundsForTargets(rows, options.targets);
        if (funds.length === 0) return { ok: false, errorCategory: "missing_fields", message: "No funds matched configured index targets" };
        return { ok: true, data: funds, source: SOURCE, dataDate: new Date().toISOString().slice(0, 10), confidence: 0.75 };
      } catch (error) {
        return { ok: false, errorCategory: "network", message: error instanceof Error ? error.message : "Unknown fund search error" };
      }
    }
  };
}

function matchesTarget(row: FundSearchRow, target: TargetSelection): boolean {
  if (target.seedFundCodes?.includes(row.code)) return true;
  if (!isTargetRelevantRow(row, target.targetCode)) return false;
  const hintText = `${row.name} ${row.shortName} ${row.pinyin} ${row.otherName ?? ""}`;
  if (matchesDiscoveryNameHint(hintText, target.targetCode)) return true;
  const haystack = normalize(hintText);
  return [target.targetName, ...target.aliases].some((alias) => {
    const normalizedAlias = normalize(alias);
    return normalizedAlias.length > 0 && haystack.includes(normalizedAlias);
  });
}

const OVERSEAS_INDEX_TARGETS = new Set(["NASDAQ_100", "SP_500", "NIKKEI_225", "KOSPI"]);

function isTargetRelevantRow(row: FundSearchRow, targetCode: string): boolean {
  const haystack = `${row.type} ${row.name}`;
  if (targetCode === "HSTECH") return /恒生|HSTECH|港股|互联/i.test(haystack);
  if (OVERSEAS_INDEX_TARGETS.has(targetCode)) return /QDII|海外股票|海外指数/i.test(haystack);
  return true;
}

export function isForeignCurrencyShare(name: string): boolean {
  return /美元|现汇|现钞|美钞|美汇/.test(name);
}

export async function fetchEastMoneyFundSuggestionsForQueries(
  fetchImpl: typeof fetch,
  queries: string[]
): Promise<FundSearchRow[]> {
  const uniqueQueries = [...new Set(queries.map((query) => query.trim()).filter(Boolean))];
  const results = await Promise.all(uniqueQueries.map((query) => fetchSuggestionRowsForQuery(fetchImpl, query)));
  return results.flat();
}

function toFund(row: FundSearchRow, targetCode: string): Fund | undefined {
  const shareClass = inferShareClass(row);
  if (shareClass === "UNKNOWN") return undefined;
  return {
    code: row.code,
    name: row.name,
    fundType: row.type,
    fundCompany: row.fundCompany,
    venue: shareClass === "ETF" || shareClass === "LOF" ? "on_exchange" : "off_exchange",
    trackingTargetCode: targetCode,
    shareClass,
    enabled: true
  };
}

export function inferShareClass(row: FundSearchRow): ShareClass {
  if (/^\d{6}$/.test(row.code) && (row.code.startsWith("15") || row.code.startsWith("51"))) return "ETF";
  if (row.code.startsWith("16")) return "LOF";
  const normalizedName = row.name.replace(/[（）]/g, (char) => (char === "（" ? "(" : ")"));
  // Off-exchange retail/agency (A/C/F) and direct/institutional (I/E/Y/D/O) share classes.
  for (const cls of ["A", "C", "F", "I", "E", "Y", "D", "O"] as const) {
    if (new RegExp(`[（(]?${cls}(?:人民币|\\(人民币\\))?[）)]?$`).test(normalizedName)) return cls;
  }
  return "UNKNOWN";
}

function normalize(value: string): string {
  return value.toUpperCase().replace(/\s+/g, "").replace(/纳指/g, "纳斯达克");
}

async function fetchSuggestionRows(fetchImpl: typeof fetch, targets: TargetSelection[]): Promise<FundSearchRow[]> {
  const queries = uniqueQueries(targets.flatMap((target) => [target.targetName, ...target.aliases, ...(target.seedFundCodes ?? [])]));
  const results = await Promise.all(queries.map((query) => fetchSuggestionRowsForQuery(fetchImpl, query)));
  return results.flat();
}

async function fetchSuggestionRowsForQuery(fetchImpl: typeof fetch, query: string): Promise<FundSearchRow[]> {
  const params = new URLSearchParams({ m: "1", key: query });
  try {
    const response = await fetchImpl(`${SUGGEST_ENDPOINT}?${params.toString()}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 globaletf/0.1",
        Referer: "https://fund.eastmoney.com/"
      }
    });
    if (!response.ok) return [];
    return parseEastMoneyFundSuggestions(await response.json());
  } catch {
    return [];
  }
}

function uniqueQueries(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}

function stringOrUndefined(value: unknown): string | undefined {
  const text = String(value ?? "");
  return text ? text : undefined;
}
