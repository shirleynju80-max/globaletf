import type { DiscoveryHealthSummary } from "../db/repositories";

interface Props {
  health: DiscoveryHealthSummary | null;
  targetName: string;
}

export function DiscoveryHealthBanner({ health, targetName }: Props) {
  if (!health) return null;

  const hasProfileGaps = health.profileGaps.length > 0;
  const hasCoverageGaps = health.coverageGaps.length > 0;
  const tone = hasProfileGaps || hasCoverageGaps ? "warn" : "ok";

  return (
    <aside className={`discovery-banner discovery-banner-${tone}`} aria-live="polite">
      <p className="discovery-banner-title">
        {tone === "ok" ? `${targetName} 发现覆盖正常` : `${targetName} 发现覆盖需关注`}
      </p>
      <p className="discovery-banner-detail">
        已入库 {health.manifestCount} 只（场内 {health.onExchangeCount}，其中 F10/筛选 {health.profileBackedOnExchange}）
        {hasProfileGaps ? ` · F10 已验证但未入库 ${health.profileGaps.length} 只：${health.profileGaps.map((gap) => gap.fundCode).join("、")}` : ""}
        {hasCoverageGaps ? ` · 已启用但未入 manifest ${health.coverageGaps.length} 只：${health.coverageGaps.join("、")}` : ""}
      </p>
    </aside>
  );
}
