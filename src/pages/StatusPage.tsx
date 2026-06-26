import { useEffect, useState } from "react";
import type { SyncStatusMap } from "../db/repositories";
import { fetchSyncStatus } from "../api/client";
import { SITE_NAME } from "../lib/brand";
import { DataStatus } from "../ui/DataStatus";
import { SiteShell } from "../ui/SiteShell";

export function StatusPage() {
  const [status, setStatus] = useState<SyncStatusMap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = `数据状态 · ${SITE_NAME}`;
    return () => {
      document.title = SITE_NAME;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;
    fetchSyncStatus()
      .then((next) => {
        if (!isCurrent) return;
        setStatus(next);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!isCurrent) return;
        setStatus(null);
        setError(cause instanceof Error ? cause.message : "无法加载同步状态");
      });
    return () => {
      isCurrent = false;
    };
  }, []);

  const warnings = summarizeWarnings(status);

  return (
    <SiteShell
      active="status"
      eyebrow="Operations"
      title="数据同步状态"
      lead="各数据域最近一次后台同步结果。指数页实时折溢价不在此显示，见对应页面的更新时间。"
    >
      {error ? <p className="note live-error">加载失败：{error}</p> : null}
      {status ? <DataStatus status={status} /> : null}
      {!status && !error ? <p className="site-loading">加载中...</p> : null}
      {warnings.length > 0 ? (
        <div className="status-warnings" role="alert">
          <p className="status-warnings-title">需要关注</p>
          <ul>
            {warnings.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : status ? (
        <p className="note">未出现同步失败。备用源/缓存表示该数据域本次未完全刷新，页面会继续使用最近可用数据；其他已入库数据仍会继续更新。</p>
      ) : null}
      <p className="note">
        服务器可定时执行 <code>npm run health-check</code>（含 acceptance 门禁）。
        失败时可配置 <code>NOTIFY_WEBHOOK_URL</code> 推送告警。
      </p>
    </SiteShell>
  );
}

function summarizeWarnings(status: SyncStatusMap | null): string[] {
  if (!status) return [];
  const lines: string[] = [];
  for (const [key, row] of Object.entries(status)) {
    if (!row) continue;
    if (row.status === "error") {
      lines.push(`${key}：同步失败${row.message ? `（${row.message}）` : ""}`);
    }
  }
  return lines;
}
