import { defaultChannelScopeForShareClass } from "./purchaseLimits";
import type { ChannelScope, PurchaseLimit, PurchaseStatus, ShareClass } from "./types";

export interface ReconciledPurchaseLimit {
  status: PurchaseStatus;
  limitAmountYuan?: number;
  limitUnit?: "per_day" | "per_order" | "unknown";
  limitEffectiveDate?: string;
  limitSyncedAt?: string;
  source?: string;
  channelScope?: ChannelScope;
  channelId?: string;
  statusConflict: boolean;
  statusSource?: string;
  amountSource?: string;
  limitStale?: boolean;
}

const DIRECT_SHARE_CLASSES = new Set<ShareClass>(["I", "F", "E", "Y", "D", "O"]);

const STATUS_RANK: Record<PurchaseStatus, number> = {
  suspended: 4,
  limited: 3,
  open: 2,
  unknown: 1
};

export function parseSyncRunDate(syncRunId: string): string | undefined {
  const match = syncRunId.match(/(\d{4})(\d{2})(\d{2})/);
  if (!match) return undefined;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function reconcilePurchaseLimit(shareClass: ShareClass, limits: PurchaseLimit[]): ReconciledPurchaseLimit {
  const scopedLimits = limitsForShareClass(shareClass, limits);
  if (scopedLimits.length === 0) {
    return { status: "unknown", statusConflict: false };
  }

  const knownStatusRows = scopedLimits.filter((row) => row.status !== "unknown");
  const statusRow = pickStrictestStatusRow(knownStatusRows.length > 0 ? knownStatusRows : scopedLimits);
  const amountRow = pickLimitAmountRow(shareClass, scopedLimits);
  const status = statusRow.status;
  const statusConflict = hasStatusConflict(shareClass, scopedLimits);
  const limitSyncedAt = latestSyncDate(scopedLimits);
  const suspended = status === "suspended";

  const limitAmountYuan = suspended ? undefined : amountRow?.limitAmountYuan;
  const limitUnit = suspended ? undefined : amountRow?.limitUnit;
  const limitEffectiveDate = suspended
    ? statusRow.dataDate
    : amountRow?.limitAmountYuan != null
      ? amountRow.dataDate
      : statusRow.dataDate;
  const limitStale = computeLimitStale(limitEffectiveDate, scopedLimits);
  return {
    status,
    limitAmountYuan,
    limitUnit,
    limitEffectiveDate,
    limitSyncedAt,
    source: amountRow?.source ?? statusRow.source,
    channelScope: amountRow?.channelScope ?? statusRow.channelScope,
    channelId: amountRow?.channelId ?? statusRow.channelId,
    statusConflict,
    statusSource: statusRow.source,
    amountSource: amountRow?.source,
    limitStale
  };
}

function pickStrictestStatusRow(rows: PurchaseLimit[]): PurchaseLimit {
  return [...rows].sort((a, b) => {
    const rankDiff = STATUS_RANK[b.status] - STATUS_RANK[a.status];
    if (rankDiff !== 0) return rankDiff;
    const dateDiff = b.dataDate.localeCompare(a.dataDate);
    if (dateDiff !== 0) return dateDiff;
    return (b.confidence ?? 0) - (a.confidence ?? 0);
  })[0];
}

function pickLimitAmountRow(shareClass: ShareClass, limits: PurchaseLimit[]): PurchaseLimit | undefined {
  const withAmount = limits.filter((row) => row.limitAmountYuan != null && row.status !== "unknown");
  if (withAmount.length === 0) return undefined;
  return [...withAmount].sort((a, b) => compareLimitRowsForAmount(a, b, shareClass))[0];
}

function compareLimitRowsForAmount(a: PurchaseLimit, b: PurchaseLimit, shareClass: ShareClass): number {
  const rankA = channelRank(shareClass, a);
  const rankB = channelRank(shareClass, b);
  if (rankA !== rankB) return rankA - rankB;

  if (isAnnouncementSource(a.source) && isAnnouncementSource(b.source)) {
    const dateDiff = b.dataDate.localeCompare(a.dataDate);
    if (dateDiff !== 0) return dateDiff;
  } else if (isAnnouncementSource(a.source) !== isAnnouncementSource(b.source)) {
    return isAnnouncementSource(a.source) ? -1 : 1;
  }

  const dateDiff = b.dataDate.localeCompare(a.dataDate);
  if (dateDiff !== 0) return dateDiff;

  const confidenceDiff = (b.confidence ?? 0) - (a.confidence ?? 0);
  if (confidenceDiff !== 0) return confidenceDiff;

  return a.source.localeCompare(b.source);
}

function channelRank(shareClass: ShareClass, row: PurchaseLimit): number {
  const prefersDirect = DIRECT_SHARE_CLASSES.has(shareClass);
  if (prefersDirect && row.channelScope === "direct" && row.status !== "unknown") return 0;
  if (!prefersDirect && row.channelScope === "agency") return 0;
  if (prefersDirect && row.channelScope === "agency" && row.status !== "unknown") return 1;
  if (!prefersDirect && row.channelScope === "direct") return 1;
  if (prefersDirect && row.channelScope === "direct" && row.status === "unknown") return 2;
  return 3;
}

function limitsForShareClass(shareClass: ShareClass, limits: PurchaseLimit[]): PurchaseLimit[] {
  const matching = limits.filter((row) => row.shareClass === shareClass);
  return matching.length > 0 ? matching : limits;
}

function hasStatusConflict(shareClass: ShareClass, limits: PurchaseLimit[]): boolean {
  const preferredScope = preferredChannelScopeForShareClass(shareClass);
  const preferredRows = limits.filter(
    (row) => row.status !== "unknown" && row.channelScope === preferredScope
  );
  const rows = preferredRows.length > 0
    ? preferredRows
    : limits.filter((row) => row.status !== "unknown");
  const statuses = new Set(rows.map((row) => row.status));
  return statuses.size > 1;
}

function latestSyncDate(limits: PurchaseLimit[]): string | undefined {
  const dates = limits
    .map((row) => parseSyncRunDate(row.syncRunId) ?? row.dataDate)
    .filter(Boolean)
    .sort();
  return dates.at(-1);
}

function isAnnouncementSource(source: string): boolean {
  return source.startsWith("fundco-announcement-") || source.startsWith("fundco-direct-");
}

function computeLimitStale(limitEffectiveDate: string | undefined, limits: PurchaseLimit[]): boolean {
  if (!limitEffectiveDate) return false;
  const announcementDates = limits
    .filter((row) => isAnnouncementSource(row.source))
    .map((row) => row.dataDate)
    .filter(Boolean)
    .sort();
  const latestAnnouncementDate = announcementDates.at(-1);
  if (!latestAnnouncementDate) return false;
  return limitEffectiveDate < latestAnnouncementDate;
}

export function preferredChannelScopeForShareClass(shareClass: ShareClass): ChannelScope {
  return defaultChannelScopeForShareClass(shareClass);
}
