import { CATALOG_FUNDS } from "../../domain/fundCatalog";
import { parseDirectLimitFromAnnouncement } from "../../domain/limitText";
import type { Fund, PurchaseLimit } from "../../domain/types";
import { defaultChannelIdForFund } from "../../domain/purchaseLimits";
import { fetchWithTimeout } from "../requestUtils";
import {
  fetchEastMoneyAnnouncementContent,
  fetchEastMoneySecurityAnnouncements,
  toAnnouncementRows
} from "./eastmoneyAnnouncements";

const SOURCE_PREFIX = "fundco-announcement";
const JJGG_ENDPOINT = "https://fundf10.eastmoney.com/F10DataApi.aspx";

export interface AnnouncementRow {
  title: string;
  date: string;
  detailPath?: string;
  artCode?: string;
}

export function announcementFundCodes(fund: Fund, catalog: Fund[] = CATALOG_FUNDS): string[] {
  const codes = new Set<string>([fund.code]);
  if (fund.parentFundCode) codes.add(fund.parentFundCode);
  for (const candidate of catalog) {
    if (candidate.code === fund.code) continue;
    if (fund.parentFundCode && candidate.parentFundCode === fund.parentFundCode && candidate.shareClass === "A") {
      codes.add(candidate.code);
    }
  }
  return [...codes];
}

export function parseEastMoneyAnnouncementList(payload: string): AnnouncementRow[] {
  const content = payload.match(/content\s*:\s*["']([\s\S]*?)["']\s*,/)?.[1] ?? payload;
  const text = decodeEscapedHtml(content);
  const rows: AnnouncementRow[] = [];
  for (const match of text.matchAll(/<a[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>[\s\S]*?(\d{4}-\d{2}-\d{2})/gi)) {
    const detailPath = match[1];
    const title = stripHtml(match[2]);
    const date = match[3];
    if (!title || !detailPath || !date) continue;
    rows.push({ title, date, detailPath });
  }
  return rows;
}

export function announcementPriority(title: string): number {
  if (/金额限制|大额申购|申购.*限制|调整.*限额/.test(title)) return 3;
  if (/暂停.*申购/.test(title) && !/赎回|节假日|境外|主要市场|主要投资场所/.test(title)) return 2;
  if (/(申购|定投|转换转入).*(限额|限制|大额)/.test(title)) return 2;
  return 0;
}

export function pickLimitAnnouncement(rows: AnnouncementRow[]): AnnouncementRow | null {
  const candidates = rows.filter((row) => announcementPriority(row.title) > 0);
  return candidates.sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    return announcementPriority(b.title) - announcementPriority(a.title);
  })[0] ?? null;
}

export async function fetchDirectLimitFromAnnouncements(
  fetchImpl: typeof fetch,
  fund: Fund,
  dataDate: string,
  syncRunId: string,
  timeoutMs: number
): Promise<PurchaseLimit | null> {
  const fromSecurityAnn = await fetchDirectLimitFromEastMoneySecurityAnnouncements(fetchImpl, fund, dataDate, syncRunId, timeoutMs);
  if (fromSecurityAnn) return fromSecurityAnn;
  return fetchDirectLimitFromF10Jjgg(fetchImpl, fund, dataDate, syncRunId, timeoutMs);
}

async function fetchDirectLimitFromEastMoneySecurityAnnouncements(
  fetchImpl: typeof fetch,
  fund: Fund,
  dataDate: string,
  syncRunId: string,
  timeoutMs: number
): Promise<PurchaseLimit | null> {
  try {
    const rows: AnnouncementRow[] = [];
    for (const fundCode of announcementFundCodes(fund)) {
      const listed = await fetchEastMoneySecurityAnnouncements(fetchImpl, fundCode, { timeoutMs });
      rows.push(...toAnnouncementRows(listed));
    }
    const announcement = pickLimitAnnouncement(rows);
    if (!announcement?.artCode) return null;

    const detail = await fetchEastMoneyAnnouncementContent(fetchImpl, announcement.artCode, timeoutMs);
    if (!detail) return null;

    return buildDirectLimitFromAnnouncementText(
      fund,
      `${detail.title}\n${stripHtml(detail.content)}`,
      announcement.date || detail.noticeDate || dataDate,
      syncRunId
    );
  } catch {
    return null;
  }
}

async function fetchDirectLimitFromF10Jjgg(
  fetchImpl: typeof fetch,
  fund: Fund,
  dataDate: string,
  syncRunId: string,
  timeoutMs: number
): Promise<PurchaseLimit | null> {
  try {
    for (const fundCode of announcementFundCodes(fund)) {
      const listUrl = `${JJGG_ENDPOINT}?type=jjgg&code=${fundCode}&page=1&per=20`;
      const listResponse = await fetchWithTimeout(fetchImpl, listUrl, {
        headers: { "User-Agent": "Mozilla/5.0 globaletf/0.1", Referer: "https://fundf10.eastmoney.com/" }
      }, timeoutMs);
      if (!listResponse.ok) continue;

      const announcement = pickLimitAnnouncement(parseEastMoneyAnnouncementList(await listResponse.text()));
      if (!announcement?.detailPath) continue;

      const detailUrl = announcement.detailPath.startsWith("http")
        ? announcement.detailPath
        : `https://fundf10.eastmoney.com${announcement.detailPath.startsWith("/") ? "" : "/"}${announcement.detailPath}`;
      const detailResponse = await fetchWithTimeout(fetchImpl, detailUrl, {
        headers: { "User-Agent": "Mozilla/5.0 globaletf/0.1", Referer: "https://fundf10.eastmoney.com/" }
      }, timeoutMs);
      if (!detailResponse.ok) continue;

      const limit = buildDirectLimitFromAnnouncementText(
        fund,
        `${announcement.title}\n${stripHtml(await detailResponse.text())}`,
        announcement.date || dataDate,
        syncRunId
      );
      if (limit) return limit;
    }
    return null;
  } catch {
    return null;
  }
}

function buildDirectLimitFromAnnouncementText(
  fund: Fund,
  text: string,
  dataDate: string,
  syncRunId: string
): PurchaseLimit | null {
  const parsed = parseDirectLimitFromAnnouncement(text, fund.shareClass, fund.code);
  if (!parsed) return null;

  const channelId = defaultChannelIdForFund(fund.shareClass, fund.fundCompany);
  return {
    fundCode: fund.code,
    shareClass: fund.shareClass,
    status: parsed.status,
    limitAmountYuan: parsed.limitAmountYuan,
    limitUnit: parsed.limitUnit,
    channelScope: "direct",
    channelId,
    source: `${SOURCE_PREFIX}-${channelId}`,
    dataDate,
    confidence: parsed.confidence,
    syncRunId
  };
}

function decodeEscapedHtml(value: string): string {
  return value.replace(/\\"/g, "\"").replace(/\\'/g, "'").replace(/\\\//g, "/");
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
