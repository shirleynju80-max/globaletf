import type { AnnouncementRow } from "./announcements";

const LIST_ENDPOINT = "https://np-anotice-stock.eastmoney.com/api/security/ann";
const DETAIL_ENDPOINT = "https://np-cnotice-stock.eastmoney.com/api/content/ann";

export interface EastMoneySecurityAnnouncement {
  artCode: string;
  title: string;
  noticeDate: string;
}

export function parseEastMoneySecurityAnnouncementList(payload: {
  data?: { list?: Array<Record<string, unknown>> };
}): EastMoneySecurityAnnouncement[] {
  const list = payload.data?.list ?? [];
  return list.flatMap((row) => {
    const artCode = String(row.art_code ?? "");
    const title = String(row.title_ch ?? row.title ?? "").trim();
    const noticeDate = String(row.notice_date ?? row.sort_date ?? "").slice(0, 10);
    if (!artCode || !title || !/^\d{4}-\d{2}-\d{2}$/.test(noticeDate)) return [];
    return [{ artCode, title, noticeDate }];
  });
}

export function toAnnouncementRows(rows: EastMoneySecurityAnnouncement[]): AnnouncementRow[] {
  return rows.map((row) => ({
    title: row.title,
    date: row.noticeDate,
    artCode: row.artCode
  }));
}

export async function fetchEastMoneySecurityAnnouncements(
  fetchImpl: typeof fetch,
  fundCode: string,
  options: { maxPages?: number; pageSize?: number; timeoutMs?: number } = {}
): Promise<EastMoneySecurityAnnouncement[]> {
  const maxPages = options.maxPages ?? 5;
  const pageSize = options.pageSize ?? 50;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const rows: EastMoneySecurityAnnouncement[] = [];

  for (let pageIndex = 1; pageIndex <= maxPages; pageIndex += 1) {
    const url = `${LIST_ENDPOINT}?sr=-1&page_size=${pageSize}&page_index=${pageIndex}&ann_type=Fund&client_source=web&stock_list=${fundCode}`;
    const response = await fetchImpl(url, {
      headers: { "User-Agent": "Mozilla/5.0 ETFLimit/0.1", Referer: "https://fund.eastmoney.com/" },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) break;
    const payload = await response.json() as { data?: { list?: Array<Record<string, unknown>> } };
    const pageRows = parseEastMoneySecurityAnnouncementList(payload);
    if (pageRows.length === 0) break;
    rows.push(...pageRows);
  }

  return rows;
}

export async function fetchEastMoneyAnnouncementContent(
  fetchImpl: typeof fetch,
  artCode: string,
  timeoutMs: number
): Promise<{ title: string; noticeDate: string; content: string } | null> {
  const url = `${DETAIL_ENDPOINT}?art_code=${artCode}&client_source=web`;
  const response = await fetchImpl(url, {
    headers: { "User-Agent": "Mozilla/5.0 ETFLimit/0.1", Referer: "https://fund.eastmoney.com/" },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) return null;

  const payload = await response.json() as {
    data?: { notice_title?: string; notice_date?: string; notice_content?: string };
  };
  const content = payload.data?.notice_content;
  if (!content) return null;

  return {
    title: String(payload.data?.notice_title ?? ""),
    noticeDate: String(payload.data?.notice_date ?? "").slice(0, 10),
    content
  };
}
