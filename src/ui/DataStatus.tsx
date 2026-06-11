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
