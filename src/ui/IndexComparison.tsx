import { formatPercent } from "../domain/fees";
import { channelIdLabel } from "../domain/channels";
import { useMemo, useState } from "react";
import type { DiscoveryHealthSummary } from "../api/client";
import { DiscoveryHealthBanner } from "./DiscoveryHealthBanner";
import { partitionOffExchangeRows } from "./offExchangePartition";

type OnExchangeSortKey = "livePremium" | "closingPremium" | "turnover";

interface LivePremium {
  price: number | null;
  priceTime: string | null;
  iopv: number | null;
  iopvTime: string | null;
  iopvPremiumDiscountRate: number | null;
  aligned: boolean | null;
  iopvSource?: "current" | "trade_date_match" | "none";
}

interface ComparisonRow {
  code: string;
  name: string;
  shareClass?: string;
  closePrice?: number;
  closingPremiumDiscountRate?: number | null;
  unitNav?: number | null;
  navDate?: string | null;
  iopv?: number | null;
  iopvTime?: string | null;
  iopvPremiumDiscountRate?: number | null;
  turnover?: number;
  tradeDate?: string;
  status?: string;
  limitAmountYuan?: number | null;
  limitUnit?: string | null;
  limitDataDate?: string | null;
  limitEffectiveDate?: string | null;
  limitSyncedAt?: string | null;
  limitStatusConflict?: boolean;
  limitStale?: boolean;
  feeDataDate?: string | null;
  channelScope?: string;
  channelId?: string;
  source?: string;
  defaultSubscriptionRate?: number | null;
  managementRate?: number | null;
  custodianRate?: number | null;
  salesServiceRate?: number | null;
  redemptionFeeSummary?: string | null;
  discoverySource?: string | null;
}

interface Props {
  targetName: string;
  data: { onExchange: ComparisonRow[]; offExchange: ComparisonRow[] };
  discoveryHealth?: DiscoveryHealthSummary | null;
  livePremiums?: Record<string, LivePremium>;
  liveAsOf?: string | null;
  liveError?: string | null;
  limitsAsOf?: string | null;
  limitsError?: string | null;
}

export function IndexComparison({ targetName, data, discoveryHealth, livePremiums, liveAsOf, liveError, limitsAsOf, limitsError }: Props) {
  const [sortKey, setSortKey] = useState<OnExchangeSortKey>("livePremium");
  const [sortDesc, setSortDesc] = useState(true);
  const onExchangeRows = useMemo(
    () => sortOnExchangeRows(data.onExchange, livePremiums, sortKey, sortDesc),
    [data.onExchange, livePremiums, sortKey, sortDesc]
  );

  const handleSort = (key: OnExchangeSortKey) => {
    if (sortKey === key) {
      setSortDesc((current) => !current);
      return;
    }
    setSortKey(key);
    setSortDesc(true);
  };

  return (
    <section className="panel data-panel">
      <DiscoveryHealthBanner health={discoveryHealth ?? null} targetName={targetName} />
      <div className="section-heading">
        <div>
          <p className="eyebrow">Index fund map</p>
          <h2>{targetName} 同标的产品比较</h2>
        </div>
        <div className="live-controls">
          {liveAsOf ? <span className="live-asof">折溢价更新于 {formatClock(liveAsOf)}</span> : null}
          {limitsAsOf ? <span className="live-asof">限额更新于 {formatClock(limitsAsOf)}</span> : null}
        </div>
      </div>
      {liveError ? <p className="note live-error">实时折溢价更新失败：{liveError}</p> : null}
      {limitsError ? <p className="note live-error">场外限额刷新失败：{limitsError}</p> : null}
      <p className="note">跨境基金的折溢价以「实时估值(IOPV)」为基准：溢价/折价 =（价格 − 实时估值）/ 实时估值。昨日收盘折溢价按最新披露单位净值计算，仅供参考。打开页面后会自动拉取实时折溢价，约每 90 秒后台静默更新；仍缺失的基金会单独补刷。场内表头可切换排序；场外基金合并展示直销与代销限额，默认按日申购限额从高到低排序，暂停申购与待核实默认折叠。场外限额状态取多源最严结果（暂停优先），打开页面后约每 30 分钟后台刷新限额快照。</p>

      <h3>场内 ETF/LOF</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>代码</th>
              <th>名称</th>
              <th>价格</th>
              <SortableHeader label="折溢价（实时）" sortKey="livePremium" activeKey={sortKey} sortDesc={sortDesc} onSort={handleSort} />
              <SortableHeader label="昨日收盘折溢价" sortKey="closingPremium" activeKey={sortKey} sortDesc={sortDesc} onSort={handleSort} />
              <SortableHeader label="昨日成交额" sortKey="turnover" activeKey={sortKey} sortDesc={sortDesc} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {onExchangeRows.length === 0 ? (
              <tr>
                <td colSpan={6}>暂无{targetName}场内 ETF/LOF 数据</td>
              </tr>
            ) : (
              onExchangeRows.map((row) => {
                const live = livePremiums?.[row.code];
                return (
                  <tr key={row.code}>
                    <td className="mono">{row.code}</td>
                    <td>{row.name}</td>
                    <td>{live?.price ?? row.closePrice}</td>
                    <td className="premium-primary">{formatPrimaryPremium(row, live)}</td>
                    <td className="premium-secondary">{formatPremiumDiscount(row)}</td>
                    <td>{formatCurrency(row.turnover)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <h3>场外基金</h3>
      <OffExchangeSection rows={data.offExchange} emptyLabel={`暂无${targetName}场外基金数据`} />
    </section>
  );
}

function OffExchangeSection({ rows, emptyLabel }: { rows: ComparisonRow[]; emptyLabel: string }) {
  const [limitSortDesc, setLimitSortDesc] = useState(true);
  const [suspendedOpen, setSuspendedOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const { active, review, suspended } = useMemo(() => partitionOffExchangeRows(rows), [rows]);
  const sortedActive = useMemo(() => sortOffExchangeByLimit(active, limitSortDesc), [active, limitSortDesc]);
  const sortedReview = useMemo(() => sortOffExchangeByLimit(review, limitSortDesc), [review, limitSortDesc]);
  const sortedSuspended = useMemo(() => sortOffExchangeByLimit(suspended, limitSortDesc), [suspended, limitSortDesc]);

  const toggleLimitSort = () => setLimitSortDesc((current) => !current);

  if (rows.length === 0) {
    return <OffExchangeTable rows={[]} emptyLabel={emptyLabel} limitSortDesc={limitSortDesc} onToggleLimitSort={toggleLimitSort} />;
  }

  return (
    <>
      <OffExchangeTable
        rows={sortedActive}
        emptyLabel={active.length === 0 ? "暂无可申购场外基金（见下方折叠区）" : emptyLabel}
        limitSortDesc={limitSortDesc}
        onToggleLimitSort={toggleLimitSort}
      />
      {review.length > 0 ? (
        <div className="off-exchange-collapsible">
          <button
            type="button"
            className="collapse-toggle"
            aria-expanded={reviewOpen}
            onClick={() => setReviewOpen((current) => !current)}
          >
            待核实（{review.length}）
            <span className="collapse-indicator">{reviewOpen ? "▲" : "▼"}</span>
          </button>
          {reviewOpen ? (
            <OffExchangeTable
              rows={sortedReview}
              emptyLabel=""
              limitSortDesc={limitSortDesc}
              onToggleLimitSort={toggleLimitSort}
              hideHeader
              showReviewFlags
            />
          ) : null}
        </div>
      ) : null}
      {suspended.length > 0 ? (
        <div className="off-exchange-collapsible">
          <button
            type="button"
            className="collapse-toggle"
            aria-expanded={suspendedOpen}
            onClick={() => setSuspendedOpen((current) => !current)}
          >
            暂停申购（{suspended.length}）
            <span className="collapse-indicator">{suspendedOpen ? "▲" : "▼"}</span>
          </button>
          {suspendedOpen ? (
            <OffExchangeTable
              rows={sortedSuspended}
              emptyLabel=""
              limitSortDesc={limitSortDesc}
              onToggleLimitSort={toggleLimitSort}
              hideHeader
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function OffExchangeTable({
  rows,
  emptyLabel,
  limitSortDesc,
  onToggleLimitSort,
  hideHeader = false,
  showReviewFlags = false
}: {
  rows: ComparisonRow[];
  emptyLabel: string;
  limitSortDesc: boolean;
  onToggleLimitSort: () => void;
  hideHeader?: boolean;
  showReviewFlags?: boolean;
}) {
  const colSpan = 9;
  return (
    <div className="table-wrap">
      <table>
        {!hideHeader ? (
          <thead>
            <tr>
              <th>代码</th>
              <th>名称</th>
              <th>份额</th>
              <th>申购状态</th>
              <th>
                <button type="button" className="sort-header-btn" onClick={onToggleLimitSort}>
                  限额{limitSortDesc ? " ↓" : " ↑"}
                </button>
              </th>
              <th>申购费</th>
              <th>赎回费</th>
              <th>运作费(管/托/销)</th>
              <th>渠道</th>
            </tr>
          </thead>
        ) : null}
        <tbody>
          {rows.length === 0 ? (
            emptyLabel ? (
              <tr>
                <td colSpan={colSpan}>{emptyLabel}</td>
              </tr>
            ) : null
          ) : (
            rows.map((row) => (
              <tr key={row.code} className={isDirectShareRow(row) ? "row-direct-limit" : undefined}>
                <td className="mono">{row.code}</td>
                <td>{row.name}</td>
                <td>{row.shareClass}</td>
                <td><StatusPill row={row} showReviewFlags={showReviewFlags} /></td>
                <td>{formatLimit(row)}</td>
                <td>{formatOptionalPercent(row.defaultSubscriptionRate)}</td>
                <td>{row.redemptionFeeSummary ?? "-"}</td>
                <td>{formatOperationFees(row)}</td>
                <td>{formatChannelScope(row.channelScope, row.channelId)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  sortDesc,
  onSort
}: {
  label: string;
  sortKey: OnExchangeSortKey;
  activeKey: OnExchangeSortKey;
  sortDesc: boolean;
  onSort: (key: OnExchangeSortKey) => void;
}) {
  const active = activeKey === sortKey;
  const indicator = active ? (sortDesc ? " ↓" : " ↑") : "";
  return (
    <th aria-sort={active ? (sortDesc ? "descending" : "ascending") : "none"}>
      <button type="button" className="sort-header-btn" onClick={() => onSort(sortKey)}>
        {label}{indicator}
      </button>
    </th>
  );
}

function sortOffExchangeByLimit(rows: ComparisonRow[], sortDesc: boolean): ComparisonRow[] {
  const direction = sortDesc ? -1 : 1;
  return [...rows].sort((a, b) => {
    const valueA = offExchangeLimitSortValue(a);
    const valueB = offExchangeLimitSortValue(b);
    if (valueA == null && valueB == null) return a.code.localeCompare(b.code);
    if (valueA == null) return 1;
    if (valueB == null) return -1;
    const diff = (valueA - valueB) * direction;
    if (diff !== 0) return diff;
    return a.code.localeCompare(b.code);
  });
}

function offExchangeLimitSortValue(row: ComparisonRow): number | null {
  if (row.status === "open") return Number.POSITIVE_INFINITY;
  if (row.limitAmountYuan != null) return row.limitAmountYuan;
  return null;
}

function sortOnExchangeRows(
  rows: ComparisonRow[],
  livePremiums: Record<string, LivePremium> | undefined,
  sortKey: OnExchangeSortKey,
  sortDesc: boolean
): ComparisonRow[] {
  const direction = sortDesc ? -1 : 1;
  return [...rows].sort((a, b) => {
    const valueA = onExchangeSortValue(a, livePremiums, sortKey);
    const valueB = onExchangeSortValue(b, livePremiums, sortKey);
    if (valueA == null && valueB == null) return a.code.localeCompare(b.code);
    if (valueA == null) return 1;
    if (valueB == null) return -1;
    const diff = (valueA - valueB) * direction;
    if (diff !== 0) return diff;
    return a.code.localeCompare(b.code);
  });
}

function onExchangeSortValue(
  row: ComparisonRow,
  livePremiums: Record<string, LivePremium> | undefined,
  sortKey: OnExchangeSortKey
): number | null {
  if (sortKey === "livePremium") {
    return livePremiums?.[row.code]?.iopvPremiumDiscountRate ?? row.iopvPremiumDiscountRate ?? null;
  }
  if (sortKey === "closingPremium") return row.closingPremiumDiscountRate ?? null;
  return row.turnover ?? null;
}

function isDirectShareRow(row: ComparisonRow): boolean {
  if (row.channelScope === "direct") return true;
  return row.shareClass === "I" || row.shareClass === "F" || row.shareClass === "E" || row.shareClass === "Y" || row.shareClass === "D" || row.shareClass === "O";
}

function StatusPill({ row, showReviewFlags = false }: { row: { status?: string; limitStatusConflict?: boolean; limitStale?: boolean }; showReviewFlags?: boolean }) {
  const normalized = normalizeStatus(row.status);
  return (
    <span className="status-cell">
      <span className={`status-pill status-pill-${normalized}`} data-status={normalized}>
        {formatStatus(row.status)}
      </span>
      {showReviewFlags && row.limitStatusConflict ? <span className="limit-flag limit-flag-conflict" title="直销与代销申购状态不一致">冲突</span> : null}
      {showReviewFlags && row.limitStale ? <span className="limit-flag limit-flag-stale" title="存在更新的限额公告未同步到展示结果">待核实</span> : null}
    </span>
  );
}

function formatCurrency(value?: number): string {
  if (value == null) return "-";
  if (value >= 100000000) return `${(value / 100000000).toFixed(2)} 亿`;
  if (value >= 10000) return `${(value / 10000).toFixed(2)} 万`;
  return `${value.toLocaleString("zh-CN")} 元`;
}

function formatLimit(row: { status?: string; limitAmountYuan?: number | null; limitUnit?: string | null }): string {
  if (row.limitAmountYuan != null) return `${formatCurrency(row.limitAmountYuan)}${formatLimitUnit(row.limitUnit)}`;
  if (row.status === "open") return "开放申购，未披露限额";
  if (row.status === "limited") return "限额待确认";
  if (row.status === "suspended") return "暂停申购";
  return "-";
}

function formatLimitUnit(unit?: string | null): string {
  if (unit === "per_day") return "/日";
  if (unit === "per_order") return "/笔";
  return "";
}

function formatPremiumDiscount(row: { closingPremiumDiscountRate?: number | null }): string {
  if (row.closingPremiumDiscountRate == null) return "净值缺失";
  return formatPercent(row.closingPremiumDiscountRate);
}

function formatPrimaryPremium(
  row: { iopvPremiumDiscountRate?: number | null },
  live?: LivePremium
): string {
  const rate = live?.iopvPremiumDiscountRate ?? row.iopvPremiumDiscountRate;
  if (rate == null) return "估值缺失";
  return formatPercent(rate);
}

function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatStatus(status?: string): string {
  if (status === "limited") return "限购";
  if (status === "open") return "开放";
  if (status === "suspended") return "暂停";
  return "未知";
}

function normalizeStatus(status?: string): "open" | "limited" | "suspended" | "unknown" {
  if (status === "open" || status === "limited" || status === "suspended") return status;
  return "unknown";
}

function formatOptionalPercent(value?: number | null): string {
  return value == null ? "-" : formatPercent(value);
}

function formatOperationFees(row: {
  managementRate?: number | null;
  custodianRate?: number | null;
  salesServiceRate?: number | null;
}): string {
  const rates = [row.managementRate, row.custodianRate, row.salesServiceRate];
  if (rates.every((rate) => rate == null)) return "-";
  return rates.map((rate) => formatOptionalPercent(rate)).join(" / ");
}

function formatChannelScope(scope?: string, channelId?: string): string {
  if (scope === "agency") return channelId && channelId !== "aggregate" && channelId !== "eastmoney_aggregate" ? `代销·${channelIdLabel(channelId)}` : "代销";
  if (scope === "direct") return "直销";
  if (scope === "special") return "特殊渠道";
  return "未知";
}
