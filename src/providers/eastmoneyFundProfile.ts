import { fetchWithTimeout } from "./requestUtils";

const PROFILE_ENDPOINT = "https://fundf10.eastmoney.com/jbgk";

export interface FundProfile {
  fundCode: string;
  /** Declared tracking target index, e.g. "纳斯达克100指数". */
  trackingIndex: string | null;
  /** Performance benchmark text, e.g. "纳斯达克100指数收益率(经汇率调整)". */
  benchmark: string | null;
}

/**
 * Parse the East Money F10 基本概况 (jbgk) HTML for the authoritative tracking target and
 * performance benchmark. These are far more precise than fund display names for confirming
 * which index a fund actually tracks (and for excluding look-alikes like 纳斯达克生物科技指数).
 */
export function parseFundProfile(fundCode: string, html: string): FundProfile {
  return {
    fundCode,
    trackingIndex: extractCell(html, "跟踪标的"),
    benchmark: extractCell(html, "业绩比较基准")
  };
}

function extractCell(html: string, label: string): string | null {
  const regex = new RegExp(`<th[^>]*>\\s*${label}\\s*</th>\\s*<td[^>]*>([\\s\\S]*?)</td>`, "i");
  const match = html.match(regex) ?? html.match(new RegExp(`${label}[^<]*</[^>]+>\\s*<td[^>]*>([\\s\\S]*?)</td>`, "i"));
  if (!match) return null;
  const text = match[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return text || null;
}

export async function fetchFundProfile(fetchImpl: typeof fetch, code: string, timeoutMs?: number): Promise<FundProfile | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        fetchImpl,
        `${PROFILE_ENDPOINT}_${code}.html`,
        { headers: { "User-Agent": "Mozilla/5.0 globaletf/0.1", Referer: "https://fundf10.eastmoney.com/" } },
        timeoutMs
      );
      if (!response.ok) continue;
      const profile = parseFundProfile(code, await response.text());
      if (profile.trackingIndex || profile.benchmark) return profile;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Whether a fund's declared tracking index / benchmark matches the expected index aliases.
 * Uses the same 纳指->纳斯达克 normalization as discovery so that "纳斯达克100" matches.
 */
export function profileMatchesIndex(profile: FundProfile, indexAliases: string[]): boolean {
  const haystack = normalizeIndexText(`${profile.trackingIndex ?? ""} ${profile.benchmark ?? ""}`);
  return indexAliases.some((alias) => {
    const needle = normalizeIndexText(alias);
    return needle.length > 0 && haystack.includes(needle);
  });
}

function normalizeIndexText(value: string): string {
  return value.toUpperCase().replace(/\s+/g, "").replace(/纳指/g, "纳斯达克");
}
