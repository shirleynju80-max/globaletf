import { parseMoneyYuan, parsePurchaseStatus, shouldPersistCompanyPageLimit } from "../../domain/limitText";
import type { DirectChannelId } from "../../domain/channels";
import type { Fund, PurchaseLimit } from "../../domain/types";
import { fetchWithTimeout } from "../requestUtils";

const SOURCE_PREFIX = "fundco-direct";

export interface CompanyPageRow {
  fundCode: string;
  statusText: string;
  limitText: string;
  remark?: string;
}

export function parseSouthernProductStatusTable(html: string): CompanyPageRow[] {
  return parseGenericProductStatusTable(html);
}

export function parseGenericProductStatusTable(html: string): CompanyPageRow[] {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  const rows: CompanyPageRow[] = [];
  for (const row of text.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => stripHtml(cell[1]));
    if (cells.length < 5) continue;
    const codeCell = cells.find((cell) => /^\d{6}$/.test(cell));
    if (!codeCell) continue;
    const statusText = cells.find((cell) => /(开放|暂停|限)/.test(cell)) ?? "";
    const limitText = cells.find((cell) => /(万元|元|无限|限额)/.test(cell)) ?? cells.at(-1) ?? "";
    rows.push({ fundCode: codeCell, statusText, limitText, remark: cells.at(-1) });
  }
  return rows;
}

export function companyPageRowToLimit(
  row: CompanyPageRow,
  fund: Fund,
  channelId: DirectChannelId,
  dataDate: string,
  syncRunId: string
): PurchaseLimit {
  return {
    fundCode: fund.code,
    shareClass: fund.shareClass,
    status: parsePurchaseStatus(row.statusText),
    limitAmountYuan: parseMoneyYuan(row.limitText),
    limitUnit: row.limitText ? "per_day" : "unknown",
    channelScope: "direct",
    channelId,
    source: `${SOURCE_PREFIX}-${channelId}`,
    dataDate,
    confidence: 0.92,
    syncRunId
  };
}

export async function fetchSouthernDirectLimits(
  fetchImpl: typeof fetch,
  funds: Fund[],
  dataDate: string,
  syncRunId: string,
  timeoutMs: number
): Promise<PurchaseLimit[]> {
  const url = "https://www.nffund.com/nfwebApi/product/queryProductStatusAndLimit";
  try {
    const response = await fetchWithTimeout(fetchImpl, url, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 ETFLimit/0.1",
        Referer: "https://www.nffund.com/",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ pageNo: 1, pageSize: 500 })
    }, timeoutMs);
    if (response.ok) {
      const payload = await response.json() as { data?: { list?: Array<Record<string, string>> } };
      const list = payload.data?.list ?? [];
      if (list.length > 0) {
        return matchCompanyRows(funds, list.map((item) => ({
          fundCode: String(item.fundCode ?? item.FUNDCODE ?? item.code ?? ""),
          statusText: String(item.applyStatus ?? item.purchaseStatus ?? item.status ?? ""),
          limitText: String(item.dayLimit ?? item.limitAmount ?? item.remark ?? item.limit ?? "")
        })), "nfjj", dataDate, syncRunId);
      }
    }
  } catch {
    // fall through to HTML table
  }

  try {
    const htmlResponse = await fetchWithTimeout(fetchImpl, "https://www.nffund.com/new/transaction-guide/product-status-and-limits.html", {
      headers: { "User-Agent": "Mozilla/5.0 ETFLimit/0.1", Referer: "https://www.nffund.com/" }
    }, timeoutMs);
    if (!htmlResponse.ok) return [];
    return matchCompanyRows(funds, parseSouthernProductStatusTable(await htmlResponse.text()), "nfjj", dataDate, syncRunId);
  } catch {
    return [];
  }
}

export async function fetchBoseraDirectLimits(
  fetchImpl: typeof fetch,
  funds: Fund[],
  dataDate: string,
  syncRunId: string,
  timeoutMs: number
): Promise<PurchaseLimit[]> {
  const limits: PurchaseLimit[] = [];
  for (const fund of funds) {
    try {
      const response = await fetchWithTimeout(
        fetchImpl,
        `https://www.bosera.com/fund/fundTradeLimit.do?fundCode=${fund.code}`,
        { headers: { "User-Agent": "Mozilla/5.0 ETFLimit/0.1", Referer: "https://www.bosera.com/" } },
        timeoutMs
      );
      if (!response.ok) continue;
      const html = await response.text();
      const statusText = extractLabeledValue(html, "申购状态") ?? "";
      const limitText = extractLabeledValue(html, "日累计申购限额") ?? extractLabeledValue(html, "申购限额") ?? "";
      if (!shouldPersistCompanyPageLimit(statusText, limitText)) continue;
      limits.push(companyPageRowToLimit({ fundCode: fund.code, statusText, limitText }, fund, "bosera", dataDate, syncRunId));
    } catch {
      continue;
    }
  }
  return limits;
}

export async function fetchHarvestDirectLimits(
  fetchImpl: typeof fetch,
  funds: Fund[],
  dataDate: string,
  syncRunId: string,
  timeoutMs: number
): Promise<PurchaseLimit[]> {
  const limits: PurchaseLimit[] = [];
  for (const fund of funds) {
    for (const url of [
      `https://www.jsfund.cn/main/fund/${fund.code}/tradeinfo`,
      `https://www.jsfund.cn/ws/fund/tradeLimit/${fund.code}`
    ]) {
      try {
        const response = await fetchWithTimeout(fetchImpl, url, {
          headers: { "User-Agent": "Mozilla/5.0 ETFLimit/0.1", Referer: "https://www.jsfund.cn/" }
        }, timeoutMs);
        if (!response.ok) continue;
        const html = await response.text();
        const statusText = extractLabeledValue(html, "申购状态") ?? "";
        const limitText = extractLabeledValue(html, "日累计申购限额") ?? extractLabeledValue(html, "申购限额") ?? "";
        if (!shouldPersistCompanyPageLimit(statusText, limitText)) continue;
        limits.push(companyPageRowToLimit({ fundCode: fund.code, statusText, limitText }, fund, "js", dataDate, syncRunId));
        break;
      } catch {
        continue;
      }
    }
  }
  return limits;
}

export async function fetchHuataiPbDirectLimits(
  fetchImpl: typeof fetch,
  funds: Fund[],
  dataDate: string,
  syncRunId: string,
  timeoutMs: number
): Promise<PurchaseLimit[]> {
  const limits: PurchaseLimit[] = [];
  for (const fund of funds) {
    for (const host of ["https://www.huatai-pb.com", "https://www.htfunds.com"]) {
      try {
        const response = await fetchWithTimeout(
          fetchImpl,
          `${host}/fund/tradeLimit?fundCode=${fund.code}`,
          { headers: { "User-Agent": "Mozilla/5.0 ETFLimit/0.1", Referer: `${host}/` } },
          timeoutMs
        );
        if (!response.ok) continue;
        const html = await response.text();
        const statusText = extractLabeledValue(html, "申购状态") ?? "";
        const limitText = extractLabeledValue(html, "日累计申购限额") ?? "";
        if (!shouldPersistCompanyPageLimit(statusText, limitText)) continue;
        limits.push(companyPageRowToLimit({ fundCode: fund.code, statusText, limitText }, fund, "htbr", dataDate, syncRunId));
        break;
      } catch {
        continue;
      }
    }
  }
  return limits;
}

export async function fetchGuangfaDirectLimits(
  fetchImpl: typeof fetch,
  funds: Fund[],
  dataDate: string,
  syncRunId: string,
  timeoutMs: number
): Promise<PurchaseLimit[]> {
  return fetchSimpleTradeLimitPages(fetchImpl, funds, "gf", [
    (code) => `https://www.gffunds.com.cn/web/fund/${code}/trade`,
    (code) => `https://www.gffunds.com.cn/fund/trade/${code}`
  ], dataDate, syncRunId, timeoutMs);
}

export async function fetchHuaanDirectLimits(
  fetchImpl: typeof fetch,
  funds: Fund[],
  dataDate: string,
  syncRunId: string,
  timeoutMs: number
): Promise<PurchaseLimit[]> {
  return fetchSimpleTradeLimitPages(fetchImpl, funds, "huaan", [
    (code) => `https://www.huaan.com.cn/fund/${code}/trade`,
    (code) => `https://www.huaan.com.cn/page/fund/trade/${code}`
  ], dataDate, syncRunId, timeoutMs);
}

export async function fetchDachengDirectLimits(
  fetchImpl: typeof fetch,
  funds: Fund[],
  dataDate: string,
  syncRunId: string,
  timeoutMs: number
): Promise<PurchaseLimit[]> {
  return fetchSimpleTradeLimitPages(fetchImpl, funds, "dc", [
    (code) => `https://www.dcfund.com.cn/dcweb/fund/tradeLimit?fundCode=${code}`,
    (code) => `https://www.dcfund.com.cn/fund/${code}/trade`
  ], dataDate, syncRunId, timeoutMs);
}

export async function fetchGuotaiDirectLimits(
  fetchImpl: typeof fetch,
  funds: Fund[],
  dataDate: string,
  syncRunId: string,
  timeoutMs: number
): Promise<PurchaseLimit[]> {
  return fetchSimpleTradeLimitPages(fetchImpl, funds, "nf", [
    (code) => `https://www.gtfund.com/gtweb/fund/tradeLimit?fundCode=${code}`,
    (code) => `https://www.gtfund.com/fund/${code}/trade`
  ], dataDate, syncRunId, timeoutMs);
}

async function fetchSimpleTradeLimitPages(
  fetchImpl: typeof fetch,
  funds: Fund[],
  channelId: DirectChannelId,
  urlBuilders: Array<(code: string) => string>,
  dataDate: string,
  syncRunId: string,
  timeoutMs: number
): Promise<PurchaseLimit[]> {
  const limits: PurchaseLimit[] = [];
  for (const fund of funds) {
    for (const buildUrl of urlBuilders) {
      try {
        const response = await fetchWithTimeout(fetchImpl, buildUrl(fund.code), {
          headers: { "User-Agent": "Mozilla/5.0 ETFLimit/0.1" }
        }, timeoutMs);
        if (!response.ok) continue;
        const html = await response.text();
        const statusText = extractLabeledValue(html, "申购状态") ?? "";
        const limitText = extractLabeledValue(html, "日累计申购限额") ?? extractLabeledValue(html, "申购限额") ?? "";
        if (!shouldPersistCompanyPageLimit(statusText, limitText)) continue;
        limits.push(companyPageRowToLimit({ fundCode: fund.code, statusText, limitText }, fund, channelId, dataDate, syncRunId));
        break;
      } catch {
        continue;
      }
    }
  }
  return limits;
}

function matchCompanyRows(
  funds: Fund[],
  rows: CompanyPageRow[],
  channelId: DirectChannelId,
  dataDate: string,
  syncRunId: string
): PurchaseLimit[] {
  const byCode = new Map(rows.map((row) => [row.fundCode, row]));
  return funds.flatMap((fund) => {
    const row = byCode.get(fund.code);
    return row ? [companyPageRowToLimit(row, fund, channelId, dataDate, syncRunId)] : [];
  });
}

function extractLabeledValue(html: string, label: string): string | null {
  const regex = new RegExp(`${label}[\\s\\S]{0,80}?</t[dh]>\\s*<td[^>]*>([\\s\\S]*?)</td>`, "i");
  const match = html.match(regex) ?? html.match(new RegExp(`${label}[^<:：]*[:：]?\\s*([^<\\n]+)`));
  if (!match) return null;
  return stripHtml(match[1]);
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
