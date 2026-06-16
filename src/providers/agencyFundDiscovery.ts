import type { AgencyChannelId } from "../domain/channels";
import { TARGET_AGENCY_CHANNELS } from "../domain/channels";
import { expandFundFamilyShareClasses, linkFeederParentEtfs } from "../domain/fundFamily";
import { preferDiscoverySource, type DiscoverySource } from "../domain/fundDiscovery";
import type { Fund } from "../domain/types";
import {
  discoverOffExchangeFundsByTrackingProfile,
  discoverOnExchangeFundsByTrackingProfile
} from "../sync/trackingVerifiedDiscovery";
import { fetchAllEastMoneyEtfScreenerRows } from "./eastmoneyEtfScreener";
import {
  fetchEastMoneyFundCodeRows,
  parseEastMoneyFundSuggestions,
  selectFundsForTargets,
  type FundSearchRow,
  type TargetSelection
} from "./eastmoneyFundSearch";
import { fetchWithTimeout } from "./requestUtils";
import type { DataProvider, ProviderAttempt, ProviderFetchResult } from "./types";

const SOURCE_PREFIX = "agency-fund-discovery";

interface AgencySearchConfig {
  channelId: AgencyChannelId;
  buildUrl: (query: string) => string;
  parse: (payload: unknown) => FundSearchRow[];
  method?: "GET" | "POST";
  body?: (query: string) => string;
  headers?: Record<string, string>;
}

interface MultiChannelDiscoveryOptions {
  targets: TargetSelection[];
  fetchImpl?: typeof fetch;
  /** Extra agency channels beyond eastmoney_aggregate (tiantian uses the same suggest API). */
  channels?: AgencyChannelId[];
  requestTimeoutMs?: number;
}

export interface DiscoveryProfileGap {
  targetCode: string;
  fundCode: string;
  venue: Fund["venue"];
}

export interface MultiChannelDiscoveryResult {
  funds: Fund[];
  profileGaps: DiscoveryProfileGap[];
}

export async function runMultiChannelFundDiscovery(
  baseFunds: Fund[],
  options: MultiChannelDiscoveryOptions
): Promise<MultiChannelDiscoveryResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.requestTimeoutMs ?? 10_000;
  const channels = options.channels ?? TARGET_AGENCY_CHANNELS.filter((channel) => channel !== "eastmoney_aggregate");

  const fundCodeRows = await fetchEastMoneyFundCodeRows(fetchImpl);
  const agency = await runAgencyDiscovery(fetchImpl, options.targets, channels, timeoutMs);
  const etfRows = await fetchAllEastMoneyEtfScreenerRows({ fetchImpl, requestTimeoutMs: timeoutMs });

  const nameMatchedFunds = selectFundsForTargets(fundCodeRows, options.targets).map((fund) => ({
    ...fund,
    discoverySource: fund.discoverySource ?? "fundcode-search"
  }));
  const agencyFunds = selectFundsForTargets(agency.rows, options.targets).map((fund) => ({
    ...fund,
    discoverySource: "agency-channel" satisfies DiscoverySource
  }));
  const etfFundsByName = selectFundsForTargets(etfRows, options.targets).map((fund) => ({
    ...fund,
    discoverySource: "screener-name" satisfies DiscoverySource
  }));

  const profileUniverse = [
    ...await discoverOnExchangeFundsByTrackingProfile(etfRows, options.targets, new Set(), { fetchImpl, requestTimeoutMs: timeoutMs }, fundCodeRows),
    ...await discoverOffExchangeFundsByTrackingProfile(fundCodeRows, options.targets, new Set(), { fetchImpl, requestTimeoutMs: timeoutMs })
  ];

  const seeded = mergeFundsByCode([
    ...profileUniverse,
    ...baseFunds.map((fund) => ({ ...fund, discoverySource: fund.discoverySource ?? "fundcode-search" })),
    ...nameMatchedFunds,
    ...agencyFunds,
    ...etfFundsByName
  ]);
  const withFamily = mergeFundsByCode([
    ...seeded,
    ...expandFundFamilyShareClasses(seeded, fundCodeRows, options.targets)
  ]);
  const linked = linkFeederParentEtfs(withFamily);
  const merged = mergeFundsByCode(linked);

  const mergedCodes = new Set(merged.map((fund) => fund.code));
  const profileGaps = profileUniverse
    .filter((fund) => !mergedCodes.has(fund.code))
    .map((fund) => ({
      targetCode: fund.trackingTargetCode ?? "",
      fundCode: fund.code,
      venue: fund.venue
    }))
    .filter((gap) => gap.targetCode);

  return { funds: merged, profileGaps };
}

/** Parse Tencent Licaitong fund search responses. */
export function parseLicaitongFundSearch(payload: unknown): FundSearchRow[] {
  const root = payload as Record<string, unknown>;
  const list = (root.fund_list ?? root.fundList ?? root.datas ?? root.data) as unknown;
  if (!Array.isArray(list)) return [];
  return list.flatMap((row) => toSearchRow(row as Record<string, unknown>));
}

/** Parse JD Finance fund search responses. */
export function parseJdFundSearch(payload: unknown): FundSearchRow[] {
  const root = payload as Record<string, unknown>;
  const resultData = (root.resultData ?? root.data) as Record<string, unknown> | undefined;
  const list = (resultData?.datas ?? resultData?.data ?? resultData?.fundList ?? root.datas) as unknown;
  if (!Array.isArray(list)) return [];
  return list.flatMap((row) => toSearchRow(row as Record<string, unknown>));
}

/** Parse Alipay fund search responses. */
export function parseAlipayFundSearch(payload: unknown): FundSearchRow[] {
  const root = payload as Record<string, unknown>;
  const list = (root.fundList ?? root.funds ?? root.result ?? root.data) as unknown;
  if (!Array.isArray(list)) return [];
  return list.flatMap((row) => toSearchRow(row as Record<string, unknown>));
}

/** Parse China Merchants Bank fund search responses. */
export function parseCmbFundSearch(payload: unknown): FundSearchRow[] {
  const root = payload as Record<string, unknown>;
  const body = (root.body ?? root.data ?? root) as Record<string, unknown>;
  const list = (body.fundList ?? body.funds ?? body.list) as unknown;
  if (!Array.isArray(list)) return [];
  return list.flatMap((row) => toSearchRow(row as Record<string, unknown>));
}

function toSearchRow(row: Record<string, unknown>): FundSearchRow[] {
  const code = String(row.fund_code ?? row.fundCode ?? row.FCODE ?? row.productId ?? row.code ?? row.CODE ?? "").trim();
  const name = String(row.fund_name ?? row.fundName ?? row.FNAME ?? row.name ?? row.NAME ?? row.fund_brief_name ?? "").trim();
  const type = String(row.fund_type ?? row.fundType ?? row.FTYPE ?? row.type ?? "").trim();
  const fundCompany = String(row.fund_company ?? row.fundCompany ?? row.JJGS ?? row.company ?? "").trim();
  if (!code || !name) return [];
  return [{
    code,
    name,
    shortName: String(row.pinyin ?? row.JP ?? row.shortName ?? "").trim() || name,
    type: type || "基金",
    pinyin: String(row.pinyin ?? row.JP ?? "").trim(),
    fundCompany: fundCompany || undefined,
    otherName: String(row.otherName ?? row.OTHERNAME ?? "").trim() || undefined
  }];
}

const AGENCY_SEARCH_CONFIGS: Record<Exclude<AgencyChannelId, "eastmoney_aggregate">, AgencySearchConfig> = {
  tiantian: {
    channelId: "tiantian",
    buildUrl: (query) => `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(query)}`,
    parse: parseEastMoneyFundSuggestions,
    headers: { Referer: "https://fund.eastmoney.com/" }
  },
  alipay: {
    channelId: "alipay",
    buildUrl: (query) => `https://fundweb.alipay.com/api/fund/search?keyword=${encodeURIComponent(query)}&pageSize=30&pageNum=1`,
    parse: parseAlipayFundSearch,
    headers: { Referer: "https://fund.alipay.com/" }
  },
  licaitong: {
    channelId: "licaitong",
    buildUrl: () => "https://www.tencentwm.com/fbp/fund/v1/fund.fu_search_cgi.fu_search_cgi.SearchFund",
    method: "POST",
    body: (query) => JSON.stringify({ keyword: query, offset: 0, limit: 30 }),
    parse: parseLicaitongFundSearch,
    headers: { Referer: "https://www.tencentwm.com/", "Content-Type": "application/json" }
  },
  jd: {
    channelId: "jd",
    buildUrl: () => "https://ms.jr.jd.com/gw/generic/jj/newna/m/searchFund",
    method: "POST",
    body: (query) => JSON.stringify({ reqData: { key: query } }),
    parse: parseJdFundSearch,
    headers: { Referer: "https://jr.jd.com/", "Content-Type": "application/json" }
  },
  cmb: {
    channelId: "cmb",
    buildUrl: (query) => `https://mobile.cmbchina.com/api/fund/search?keyword=${encodeURIComponent(query)}&pageSize=30`,
    parse: parseCmbFundSearch,
    headers: { Referer: "https://m.cmbchina.com/" }
  }
};

export function mergeFundRowsByCode(rows: FundSearchRow[]): FundSearchRow[] {
  const byCode = new Map<string, FundSearchRow>();
  for (const row of rows) {
    const existing = byCode.get(row.code);
    if (!existing) {
      byCode.set(row.code, row);
      continue;
    }
    byCode.set(row.code, {
      ...existing,
      name: existing.name || row.name,
      type: existing.type || row.type,
      fundCompany: existing.fundCompany ?? row.fundCompany,
      otherName: [existing.otherName, row.otherName].filter(Boolean).join(",") || undefined
    });
  }
  return [...byCode.values()];
}

export function uniqueDiscoveryQueries(targets: TargetSelection[]): string[] {
  return [...new Set(targets.flatMap((target) => [target.targetName, ...target.aliases, ...(target.seedFundCodes ?? [])]).map((value) => value.trim()).filter(Boolean))];
}

export async function fetchAgencyDiscoveryRows(
  fetchImpl: typeof fetch,
  channelId: AgencyChannelId,
  queries: string[],
  timeoutMs: number
): Promise<FundSearchRow[]> {
  if (channelId === "eastmoney_aggregate") return [];
  const config = AGENCY_SEARCH_CONFIGS[channelId];
  const results = await Promise.all(queries.map((query) => fetchAgencyQuery(fetchImpl, config, query, timeoutMs)));
  return mergeFundRowsByCode(results.flat());
}

async function fetchAgencyQuery(
  fetchImpl: typeof fetch,
  config: AgencySearchConfig,
  query: string,
  timeoutMs: number
): Promise<FundSearchRow[]> {
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      config.buildUrl(query),
      {
        method: config.method ?? "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 ETFLimit/0.1",
          ...(config.headers ?? {})
        },
        body: config.method === "POST" ? config.body?.(query) : undefined
      },
      timeoutMs
    );
    if (!response.ok) return [];
    const payload = config.method === "POST" ? await response.json() : await response.json().catch(() => response.text());
    if (typeof payload === "string") return [];
    return config.parse(payload);
  } catch {
    return [];
  }
}

export async function runAgencyDiscovery(
  fetchImpl: typeof fetch,
  targets: TargetSelection[],
  channels: AgencyChannelId[],
  timeoutMs: number
): Promise<{ rows: FundSearchRow[]; attempts: ProviderAttempt[] }> {
  const queries = uniqueDiscoveryQueries(targets);
  const attempts: ProviderAttempt[] = [];
  const channelRows: FundSearchRow[] = [];

  for (const channelId of channels) {
    if (channelId === "eastmoney_aggregate") continue;
    const fetchedAt = new Date().toISOString();
    const rows = await fetchAgencyDiscoveryRows(fetchImpl, channelId, queries, timeoutMs);
    channelRows.push(...rows);
    attempts.push({
      providerName: `${SOURCE_PREFIX}-${channelId}`,
      ok: rows.length > 0,
      fetchedAt,
      dataDate: fetchedAt.slice(0, 10),
      confidence: rows.length > 0 ? 0.65 : undefined,
      errorCategory: rows.length > 0 ? undefined : "missing_fields",
      message: rows.length > 0 ? `matched ${rows.length} rows` : "no rows matched"
    });
  }

  return { rows: mergeFundRowsByCode(channelRows), attempts };
}

/**
 * Augments East Money discovery with agency-channel searches (支付宝/天天/理财通/京东/招行).
 * Limits are usually identical across agency platforms; the goal is fund coverage, not per-channel limits.
 */
export function createAgencyAugmentedFundDiscoveryProvider(
  baseProvider: DataProvider<Fund[]>,
  options: MultiChannelDiscoveryOptions
): DataProvider<Fund[]> {
  return {
    name: "multi-channel-fund-discovery",
    fetch: async (): Promise<ProviderFetchResult<Fund[]>> => {
      const baseResult = await baseProvider.fetch();
      const baseFunds = (baseResult.ok ? baseResult.data : []).map((fund) => ({
        ...fund,
        discoverySource: fund.discoverySource ?? "fundcode-search"
      }));

      const { funds, profileGaps } = await runMultiChannelFundDiscovery(baseFunds, options);
      const dataDate = baseResult.ok ? baseResult.dataDate : new Date().toISOString().slice(0, 10);

      if (funds.length === 0) {
        return baseResult.ok
          ? { ok: false, errorCategory: "missing_fields", message: "No funds matched configured index targets" }
          : baseResult;
      }

      return {
        ok: true,
        data: funds,
        source: baseResult.ok ? `${baseResult.source}+multi-channel` : "multi-channel-fund-discovery",
        dataDate,
        confidence: Math.max(baseResult.ok ? baseResult.confidence : 0, 0.75),
        discoveryProfileGaps: profileGaps
      };
    }
  };
}

export function mergeFundsByCode(funds: Fund[]): Fund[] {
  const byCode = new Map<string, Fund>();
  for (const fund of funds) {
    const existing = byCode.get(fund.code);
    if (!existing) {
      byCode.set(fund.code, fund);
      continue;
    }
    byCode.set(fund.code, {
      ...existing,
      name: existing.name || fund.name,
      fundType: existing.fundType || fund.fundType,
      fundCompany: existing.fundCompany ?? fund.fundCompany,
      venue: existing.venue === "on_exchange" || fund.venue === "on_exchange" ? "on_exchange" : existing.venue,
      shareClass: preferShareClass(existing.shareClass, fund.shareClass, existing.venue, fund.venue),
      trackingTargetCode: existing.trackingTargetCode ?? fund.trackingTargetCode,
      discoverySource: preferDiscoverySource(
        existing.discoverySource as DiscoverySource | undefined,
        fund.discoverySource as DiscoverySource | undefined
      )
    });
  }
  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
}

function preferShareClass(left: Fund["shareClass"], right: Fund["shareClass"], leftVenue: Fund["venue"], rightVenue: Fund["venue"]): Fund["shareClass"] {
  const onExchange = leftVenue === "on_exchange" || rightVenue === "on_exchange";
  if (onExchange) {
    if (left === "ETF" || right === "ETF") return "ETF";
    if (left === "LOF" || right === "LOF") return "LOF";
  }
  if (left !== "UNKNOWN") return left;
  return right;
}
