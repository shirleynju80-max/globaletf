export const FUND_RETURN_PERIODS = ["1w", "1m", "3m", "6m", "1y"] as const;
export type FundReturnPeriod = (typeof FUND_RETURN_PERIODS)[number];

export const FUND_RETURN_PERIOD_LABELS: Record<FundReturnPeriod, string> = {
  "1w": "近1周",
  "1m": "近1月",
  "3m": "近3月",
  "6m": "近6月",
  "1y": "近1年"
};

const PERIOD_CALENDAR_DAYS: Record<FundReturnPeriod, number> = {
  "1w": 7,
  "1m": 30,
  "3m": 90,
  "6m": 180,
  "1y": 365
};

export interface DatedValue {
  date: string;
  value: number;
}

export interface FundReturnSnapshot {
  fundCode: string;
  asOfDate: string;
  returns: Record<FundReturnPeriod, number | null>;
}

export function subtractCalendarDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** Latest point on or before `date` in ascending series. */
export function valueOnOrBefore(series: DatedValue[], date: string): DatedValue | undefined {
  let candidate: DatedValue | undefined;
  for (const point of series) {
    if (point.date > date) break;
    candidate = point;
  }
  return candidate;
}

export function computePeriodReturns(series: DatedValue[]): FundReturnSnapshot | null {
  if (series.length === 0) return null;
  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.at(-1);
  if (!latest || !Number.isFinite(latest.value) || latest.value <= 0) return null;

  const returns = {} as Record<FundReturnPeriod, number | null>;
  for (const period of FUND_RETURN_PERIODS) {
    const anchorDate = subtractCalendarDays(latest.date, PERIOD_CALENDAR_DAYS[period]);
    const base = valueOnOrBefore(sorted, anchorDate);
    if (!base || base.value <= 0) {
      returns[period] = null;
      continue;
    }
    returns[period] = latest.value / base.value - 1;
  }

  return { fundCode: "", asOfDate: latest.date, returns };
}

export function formatReturnPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const pct = value * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function returnTone(value: number | null | undefined): "up" | "down" | "flat" | "none" {
  if (value == null || !Number.isFinite(value)) return "none";
  if (value > 0.0001) return "up";
  if (value < -0.0001) return "down";
  return "flat";
}
