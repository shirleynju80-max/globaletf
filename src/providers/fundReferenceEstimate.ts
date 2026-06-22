import { fetchFundEstimate, type FundEstimate } from "./eastmoneyIopv";
import { parseEastMoneyNavLatest } from "./eastmoneyOnExchangeQuotes";
import { fetchWithTimeout } from "./requestUtils";

/**
 * Real-time fundgz estimate when available; otherwise latest disclosed unit NAV
 * as a reference for premium/discount (common for ETFs without fundgz IOPV).
 */
export async function fetchFundReferenceEstimate(
  fetchImpl: typeof fetch,
  code: string,
  timeoutMs = 12_000
): Promise<FundEstimate | null> {
  const primary = await fetchFundEstimate(fetchImpl, code, timeoutMs);
  if (primary?.iopv != null) return primary;

  const nav = await safeFetchDisclosedNav(fetchImpl, code, timeoutMs);
  if (!nav) return primary;

  return {
    fundCode: code,
    unitNav: nav.unitNav,
    navDate: nav.navDate,
    iopv: nav.unitNav,
    iopvTime: `${nav.navDate} 15:00`
  };
}

async function safeFetchDisclosedNav(
  fetchImpl: typeof fetch,
  code: string,
  timeoutMs: number
): Promise<{ unitNav: number; navDate: string } | null> {
  try {
    const params = new URLSearchParams({ type: "lsjz", code, page: "1", per: "3" });
    const response = await fetchWithTimeout(
      fetchImpl,
      `https://fundf10.eastmoney.com/F10DataApi.aspx?${params.toString()}`,
      { headers: { "User-Agent": "Mozilla/5.0 globaletf/0.1", Referer: "https://fundf10.eastmoney.com/" } },
      timeoutMs
    );
    if (!response.ok) return null;
    const nav = parseEastMoneyNavLatest(await response.text());
    return { unitNav: nav.unitNav, navDate: nav.navDate };
  } catch {
    return null;
  }
}
