import type { Fund } from "../domain/types";
import { selectFundsForTargets, type FundSearchRow, type TargetSelection } from "./eastmoneyFundSearch";
import { fetchWithTimeout } from "./requestUtils";
import type { DataProvider } from "./types";

const SOURCE = "eastmoney-etf-screener";
const CLIST_HOSTS = ["https://push2.eastmoney.com", "https://push2delay.eastmoney.com"];
const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGES = 20;

interface ProviderOptions {
  targets: TargetSelection[];
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
}

interface FetchAllOptions {
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
  pageSize?: number;
  maxPages?: number;
}

/** Parse East Money ETF/LOF screener rows (push2 clist). */
export function parseEastMoneyEtfScreener(payload: unknown): FundSearchRow[] {
  const rows = (payload as { data?: { diff?: Array<Record<string, unknown>> } }).data?.diff ?? [];
  return rows.flatMap((row) => {
    const code = String(row.f12 ?? "").trim();
    const name = String(row.f14 ?? "").trim();
    if (!code || !name) return [];
    return [{
      code,
      name,
      shortName: name,
      type: "指数型-海外股票",
      pinyin: ""
    }];
  });
}

export function mergeFundSearchRowsByCode(rows: FundSearchRow[]): FundSearchRow[] {
  const byCode = new Map<string, FundSearchRow>();
  for (const row of rows) {
    const existing = byCode.get(row.code);
    if (!existing || row.name.length > existing.name.length) {
      byCode.set(row.code, row);
    }
  }
  return [...byCode.values()];
}

/** Fetch the full ETF/LOF screener universe with pagination. */
export async function fetchAllEastMoneyEtfScreenerRows(options: FetchAllOptions = {}): Promise<FundSearchRow[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.requestTimeoutMs ?? 10_000;
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxPages = options.maxPages ?? MAX_PAGES;
  const merged: FundSearchRow[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const params = new URLSearchParams({
      pn: String(page),
      pz: String(pageSize),
      po: "1",
      np: "1",
      fltt: "2",
      invt: "2",
      fid: "f3",
      fs: "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23",
      fields: "f12,f14"
    });

    const response = await fetchClistPage(fetchImpl, params, timeoutMs);
    if (!response) break;
    if (!response.ok) break;

    let payload: { data?: { diff?: unknown[]; total?: number } };
    try {
      payload = await response.json() as { data?: { diff?: unknown[]; total?: number } };
    } catch {
      break;
    }
    const pageRows = parseEastMoneyEtfScreener(payload);
    if (pageRows.length === 0) break;
    merged.push(...pageRows);

    const total = payload.data?.total ?? merged.length;
    if (merged.length >= total || page * pageSize >= total) break;
  }

  return mergeFundSearchRowsByCode(merged);
}

async function fetchClistPage(
  fetchImpl: typeof fetch,
  params: URLSearchParams,
  timeoutMs: number
): Promise<Response | null> {
  for (const host of CLIST_HOSTS) {
    try {
      const response = await fetchWithTimeout(
        fetchImpl,
        `${host}/api/qt/clist/get?${params.toString()}`,
        { headers: { "User-Agent": "Mozilla/5.0 globaletf/0.1", Referer: "https://quote.eastmoney.com/" } },
        timeoutMs
      );
      if (response.ok) return response;
    } catch {
      continue;
    }
  }
  return null;
}

export function createEastMoneyEtfScreenerProvider(options: ProviderOptions): DataProvider<Fund[]> {
  return {
    name: SOURCE,
    fetch: async () => {
      const fetchImpl = options.fetchImpl ?? fetch;
      const timeoutMs = options.requestTimeoutMs ?? 10_000;

      try {
        const rows = await fetchAllEastMoneyEtfScreenerRows({ fetchImpl, requestTimeoutMs: timeoutMs });
        const funds = selectFundsForTargets(rows, options.targets).map((fund) => ({
          ...fund,
          discoverySource: "screener-name"
        }));
        if (funds.length === 0) {
          return { ok: false, errorCategory: "missing_fields", message: "No ETFs matched configured index targets" };
        }
        return { ok: true, data: funds, source: SOURCE, dataDate: new Date().toISOString().slice(0, 10), confidence: 0.8 };
      } catch (error) {
        return { ok: false, errorCategory: "network", message: error instanceof Error ? error.message : "ETF screener error" };
      }
    }
  };
}
