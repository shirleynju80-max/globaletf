import { fetchWithTimeout } from "./requestUtils";

export const FUNDGZ_ENDPOINT = "https://fundgz.1234567.com.cn/js";

export interface FundEstimate {
  fundCode: string;
  /** Latest disclosed official unit NAV (may lag for QDII funds). */
  unitNav: number | null;
  /** Disclosed NAV date. */
  navDate: string | null;
  /** Real-time estimated reference NAV (IOPV / 实时估值). */
  iopv: number | null;
  /** Timestamp of the estimate (e.g. "2026-06-13 04:00"). */
  iopvTime: string | null;
}

/**
 * Parse East Money's fund estimate JSONP, e.g.
 * `jsonpgz({"fundcode":"159632","jzrq":"2026-06-11","dwjz":"2.2733","gsz":"2.2872","gszzl":"0.61","gztime":"2026-06-13 04:00"});`
 */
export function parseFundEstimate(payload: string): FundEstimate {
  const match = payload.match(/jsonpgz\((\{[\s\S]*?\})\)/);
  if (!match) throw new Error("Missing fundgz payload");
  const data = JSON.parse(match[1]) as Record<string, string>;
  const fundCode = String(data.fundcode ?? "");
  if (!fundCode) throw new Error("Missing fund code in fundgz payload");
  return {
    fundCode,
    unitNav: toNumber(data.dwjz),
    navDate: data.jzrq || null,
    iopv: toNumber(data.gsz),
    iopvTime: data.gztime || null
  };
}

export async function fetchFundEstimate(
  fetchImpl: typeof fetch,
  code: string,
  timeoutMs?: number
): Promise<FundEstimate | null> {
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      `${FUNDGZ_ENDPOINT}/${code}.js?rt=${Date.now()}`,
      { headers: { "User-Agent": "Mozilla/5.0 globaletf/0.1", Referer: "https://fund.eastmoney.com/" } },
      timeoutMs
    );
    if (!response.ok) return null;
    return parseFundEstimate(await response.text());
  } catch {
    return null;
  }
}

function toNumber(value: string | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
