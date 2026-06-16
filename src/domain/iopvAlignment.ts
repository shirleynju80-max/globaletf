import { calculateIopvPremiumDiscount } from "./quotes";

export interface IopvPoint {
  iopv: number;
  /** Beijing-local timestamp, e.g. "2026-06-13 04:00". */
  iopvTime: string;
  iopvTimeMs: number;
}

export interface IopvResolveInput {
  price: number | null;
  /** Epoch ms of the secondary-market price quote. */
  priceTimeMs: number | null;
  /** A-share trade date (YYYY-MM-DD). Authoritative when the price is a session close. */
  tradeDate?: string | null;
  /** Latest IOPV from fundgz (may reference a newer US close than the price). */
  current: { iopv: number | null; iopvTime: string | null } | null;
  /** Historical IOPV snapshots keyed by gztime, used to look up the session-matched estimate. */
  priorSnapshots: IopvPoint[];
}

export interface ResolvedIopvPremium {
  price: number | null;
  priceTimeMs: number | null;
  iopv: number | null;
  iopvTime: string | null;
  iopvPremiumDiscountRate: number | null;
  /** true = latest fundgz IOPV matches the A-share session; false = fell back to the session IOPV. */
  aligned: boolean | null;
  /** How the IOPV reference was chosen. */
  iopvSource: "current" | "trade_date_match" | "none";
}

/** Parse East Money Beijing-local "YYYY-MM-DD HH:mm" into epoch milliseconds. */
export function parseBeijingTimeMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  return Date.UTC(y, mo - 1, d, h - 8, mi);
}

/** A-share last close on a trade date: 15:00 Beijing. */
export function tradeDateCloseMs(tradeDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tradeDate)) return null;
  const [y, mo, d] = tradeDate.split("-").map(Number);
  return Date.UTC(y, mo - 1, d, 15 - 8, 0);
}

/** Beijing calendar date (YYYY-MM-DD) for an instant. */
export function beijingDateFromMs(ms: number): string {
  const shifted = new Date(ms + 8 * 3600_000);
  const y = shifted.getUTCFullYear();
  const mo = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/**
 * QDII IOPV gztime for an A-share trade date.
 *
 * East Money publishes the post-US-close estimate at ~04:00 Beijing on the same
 * calendar day as the A-share session (US 16:00 ET ≈ next-day 04:00 CN).
 */
export function expectedIopvGztimeForTradeDate(tradeDate: string): string {
  return `${tradeDate} 04:00`;
}

export function resolveTradeDate(priceTimeMs: number | null, tradeDate?: string | null): string | null {
  if (tradeDate && /^\d{4}-\d{2}-\d{2}$/.test(tradeDate)) return tradeDate;
  if (priceTimeMs == null) return null;
  return beijingDateFromMs(priceTimeMs);
}

/**
 * True when fundgz IOPV is still the reference for the frozen A-share price on tradeDate.
 *
 * A newer US session lands as gztime on calendar day D where D > tradeDate (e.g. Friday
 * close price vs Saturday 04:00 IOPV). We match by trade date, not by "previous row".
 */
export function iopvGztimeMatchesTradeSession(iopvTime: string, tradeDate: string, priceTimeMs: number): boolean {
  const iopvMs = parseBeijingTimeMs(iopvTime);
  if (iopvMs == null) return false;
  if (iopvMs > priceTimeMs) return false;
  const gzDate = iopvTime.slice(0, 10);
  return gzDate <= tradeDate;
}

/**
 * Pick the IOPV reference that matches the A-share trade session.
 *
 * QDII IOPV updates after each US close (gztime ~04:00 Beijing). When A-shares are closed
 * but a newer US session has landed, fundgz IOPV is ahead of the frozen ETF price.
 * In that case use the IOPV for the price's trade date (gztime `${tradeDate} 04:00`),
 * accounting for the US/CN timezone offset, instead of blindly taking the prior DB row.
 */
export function resolveIopvPremium(input: IopvResolveInput): ResolvedIopvPremium {
  const base = {
    price: input.price,
    priceTimeMs: input.priceTimeMs,
    iopv: null as number | null,
    iopvTime: null as string | null,
    iopvPremiumDiscountRate: null as number | null,
    aligned: null as boolean | null,
    iopvSource: "none" as const
  };

  if (input.price == null) return base;

  if (input.priceTimeMs == null) {
    const currentIopv = input.current?.iopv ?? null;
    if (currentIopv != null && input.current?.iopvTime) {
      return finish(base, input.price, null, currentIopv, input.current.iopvTime, null, "current");
    }
    return { ...base, price: input.price };
  }

  const tradeDate = resolveTradeDate(input.priceTimeMs, input.tradeDate);
  const currentIopv = input.current?.iopv ?? null;
  const currentTime = input.current?.iopvTime ?? null;

  if (tradeDate && currentIopv != null && currentTime && iopvGztimeMatchesTradeSession(currentTime, tradeDate, input.priceTimeMs)) {
    return finish(base, input.price, input.priceTimeMs, currentIopv, currentTime, true, "current");
  }

  if (tradeDate) {
    const matched = pickIopvForTradeDate(input.priorSnapshots, tradeDate, currentIopv, currentTime);
    if (matched) {
      const aligned = matched.source === "current";
      return finish(base, input.price, input.priceTimeMs, matched.iopv, matched.iopvTime, aligned, aligned ? "current" : "trade_date_match");
    }
  }

  if (currentIopv != null && currentTime) {
    return finish(base, input.price, input.priceTimeMs, currentIopv, currentTime, false, "current");
  }

  return base;
}

function pickIopvForTradeDate(
  snapshots: IopvPoint[],
  tradeDate: string,
  currentIopv: number | null,
  currentTime: string | null
): { iopv: number; iopvTime: string; source: "current" | "snapshot" } | null {
  const expectedGztime = expectedIopvGztimeForTradeDate(tradeDate);

  if (currentIopv != null && currentTime === expectedGztime) {
    return { iopv: currentIopv, iopvTime: currentTime, source: "current" };
  }

  const exact = snapshots.find((row) => row.iopvTime === expectedGztime);
  if (exact) return { iopv: exact.iopv, iopvTime: exact.iopvTime, source: "snapshot" };

  const sameDay = snapshots.find((row) => row.iopvTime.startsWith(`${tradeDate} `));
  if (sameDay) return { iopv: sameDay.iopv, iopvTime: sameDay.iopvTime, source: "snapshot" };

  return null;
}

function finish(
  base: ResolvedIopvPremium,
  price: number,
  priceTimeMs: number | null,
  iopv: number,
  iopvTime: string,
  aligned: boolean | null,
  iopvSource: "current" | "trade_date_match"
): ResolvedIopvPremium {
  return {
    ...base,
    price,
    priceTimeMs,
    iopv,
    iopvTime,
    iopvPremiumDiscountRate: calculateIopvPremiumDiscount(price, iopv),
    aligned,
    iopvSource
  };
}

export function toIopvPoint(iopv: number, iopvTime: string): IopvPoint | null {
  const iopvTimeMs = parseBeijingTimeMs(iopvTime);
  if (iopvTimeMs == null || !Number.isFinite(iopv)) return null;
  return { iopv, iopvTime, iopvTimeMs };
}
