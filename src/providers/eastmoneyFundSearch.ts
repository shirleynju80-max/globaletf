import type { Fund, ShareClass } from "../domain/types";
import type { DataProvider } from "./types";

const SOURCE = "eastmoney-fundcode-search";
const ENDPOINT = "https://fund.eastmoney.com/js/fundcode_search.js";

export interface FundSearchRow {
  code: string;
  shortName: string;
  name: string;
  type: string;
  pinyin: string;
}

interface TargetSelection {
  targetCode: string;
  targetName: string;
  aliases: string[];
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

export function selectFundsForTarget(rows: FundSearchRow[], target: TargetSelection): Fund[] {
  return rows
    .filter((row) => matchesTarget(row, target))
    .filter((row) => !isForeignCurrencyShare(row.name))
    .map((row) => toFund(row, target.targetCode))
    .filter((fund): fund is Fund => fund != null)
    .sort((a, b) => a.code.localeCompare(b.code));
}

export function selectFundsForTargets(rows: FundSearchRow[], targets: TargetSelection[]): Fund[] {
  return targets.flatMap((target) => selectFundsForTarget(rows, target));
}

export function createEastMoneyFundSearchProvider(options: ProviderOptions): DataProvider<Fund[]> {
  return {
    name: SOURCE,
    fetch: async () => {
      const fetchImpl = options.fetchImpl ?? fetch;
      try {
        const response = await fetchImpl(ENDPOINT, {
          headers: {
            "User-Agent": "Mozilla/5.0 ETFLimit/0.1",
            Referer: "https://fund.eastmoney.com/"
          }
        });
        if (!response.ok) return { ok: false, errorCategory: "http", message: `${ENDPOINT} returned ${response.status}` };

        const funds = selectFundsForTarget(parseEastMoneyFundSearch(await response.text()), options);
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
        const response = await fetchImpl(ENDPOINT, {
          headers: {
            "User-Agent": "Mozilla/5.0 ETFLimit/0.1",
            Referer: "https://fund.eastmoney.com/"
          }
        });
        if (!response.ok) return { ok: false, errorCategory: "http", message: `${ENDPOINT} returned ${response.status}` };

        const funds = selectFundsForTargets(parseEastMoneyFundSearch(await response.text()), options.targets);
        if (funds.length === 0) return { ok: false, errorCategory: "missing_fields", message: "No funds matched configured index targets" };
        return { ok: true, data: funds, source: SOURCE, dataDate: new Date().toISOString().slice(0, 10), confidence: 0.75 };
      } catch (error) {
        return { ok: false, errorCategory: "network", message: error instanceof Error ? error.message : "Unknown fund search error" };
      }
    }
  };
}

function matchesTarget(row: FundSearchRow, target: TargetSelection): boolean {
  const haystack = normalize(`${row.name} ${row.shortName} ${row.pinyin}`);
  return [target.targetName, ...target.aliases].some((alias) => haystack.includes(normalize(alias)));
}

function isForeignCurrencyShare(name: string): boolean {
  return /美元|现汇|现钞/.test(name);
}

function toFund(row: FundSearchRow, targetCode: string): Fund | undefined {
  const shareClass = inferShareClass(row);
  if (shareClass === "UNKNOWN") return undefined;
  return {
    code: row.code,
    name: row.name,
    fundType: row.type,
    venue: shareClass === "ETF" || shareClass === "LOF" ? "on_exchange" : "off_exchange",
    trackingTargetCode: targetCode,
    shareClass,
    enabled: true
  };
}

function inferShareClass(row: FundSearchRow): ShareClass {
  if (/^\d{6}$/.test(row.code) && (row.code.startsWith("15") || row.code.startsWith("51"))) return "ETF";
  if (row.code.startsWith("16")) return "LOF";
  const normalizedName = row.name.replace(/[（）]/g, (char) => (char === "（" ? "(" : ")"));
  if (/[（(]?A(?:人民币|\(人民币\))?[）)]?$/.test(normalizedName)) return "A";
  if (/[（(]?C(?:人民币|\(人民币\))?[）)]?$/.test(normalizedName)) return "C";
  if (/[（(]?F(?:人民币|\(人民币\))?[）)]?$/.test(normalizedName)) return "F";
  return "UNKNOWN";
}

function normalize(value: string): string {
  return value.toUpperCase().replace(/\s+/g, "").replace(/纳指/g, "纳斯达克");
}
