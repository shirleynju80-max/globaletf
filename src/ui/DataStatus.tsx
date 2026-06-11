import type { SyncStatusMap, SyncStatusRow } from "../db/repositories";

interface Props {
  status?: SyncStatusMap | null;
}

const LABELS: Array<{ key: keyof SyncStatusMap; label: string }> = [
  { key: "quote", label: "行情" },
  { key: "purchaseLimit", label: "限购" },
  { key: "fee", label: "费率" },
  { key: "holding", label: "持仓" }
];

export function DataStatus({ status }: Props) {
  return (
    <aside className="status-strip" aria-label="数据状态">
      {LABELS.map(({ key, label }) => (
        <span key={key}>{formatStatus(label, status?.[key])}</span>
      ))}
    </aside>
  );
}

function formatStatus(label: string, row?: SyncStatusRow): string {
  if (!row) return `${label}：暂无状态`;

  const parts = [
    `${label}：${formatStatusValue(row.status)}`,
    row.dataDate,
    row.source,
    `${row.itemCount}条`,
    row.freshItemCount == null ? null : `刷新${row.freshItemCount}条`,
    row.cachedItemCount == null ? null : `缓存${row.cachedItemCount}条`,
    row.durationMs == null ? null : `耗时${formatDuration(row.durationMs)}`,
    formatUpdatedAt(row.updatedAt),
    row.message
  ].filter(Boolean);

  return parts.join(" · ");
}

function formatStatusValue(status: SyncStatusRow["status"]): string {
  if (status === "ok") return "正常";
  if (status === "fallback") return "备用源";
  return "失败";
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatUpdatedAt(updatedAt: string): string | null {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `同步${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`;
}
