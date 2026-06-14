import { formatPercent } from "../domain/fees";

interface Props {
  targetName: string;
  data: { onExchange: any[]; offExchange: any[] };
}

export function IndexComparison({ targetName, data }: Props) {
  return (
    <section className="panel data-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Index fund map</p>
          <h2>{targetName} 同标的产品比较</h2>
        </div>
        <span className="source-pill">本地快照</span>
      </div>
      <p className="note">昨日收盘折溢价按最新披露单位净值计算，仅供参考，不代表当前盘中折溢价。场内按成交额排序，场外按开放申购和限额金额排序。申购费默认展示最低金额段。</p>

      <h3>场内 ETF/LOF</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>代码</th>
              <th>名称</th>
              <th>昨日收盘价</th>
              <th>昨日收盘折溢价</th>
              <th>成交额</th>
              <th>交易成本提示</th>
              <th>日期</th>
              <th>来源</th>
            </tr>
          </thead>
          <tbody>
            {data.onExchange.length === 0 ? (
              <tr>
                <td colSpan={8}>暂无{targetName}场内 ETF/LOF 数据</td>
              </tr>
            ) : (
              data.onExchange.map((row) => (
                <tr key={row.code}>
                  <td className="mono">{row.code}</td>
                  <td>{row.name}</td>
                  <td>{row.closePrice}</td>
                  <td>{formatPremiumDiscount(row)}</td>
                  <td>{formatCurrency(row.turnover)}</td>
                  <td>{formatTradingCostHint(row.turnover)}</td>
                  <td>{row.tradeDate}</td>
                  <td>{row.source}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h3>场外 A/C/F 份额</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>代码</th>
              <th>名称</th>
              <th>份额</th>
              <th>申购状态</th>
              <th>限额</th>
              <th>可买性</th>
              <th>申购费</th>
              <th>赎回费</th>
              <th>运作费(管/托/销)</th>
              <th>渠道范围</th>
              <th>数据日期</th>
              <th>来源</th>
            </tr>
          </thead>
          <tbody>
            {data.offExchange.length === 0 ? (
              <tr>
                <td colSpan={12}>暂无{targetName}场外 A/C/F 数据</td>
              </tr>
            ) : (
              data.offExchange.map((row) => (
                <tr key={row.code}>
                  <td className="mono">{row.code}</td>
                  <td>{row.name}</td>
                  <td>{row.shareClass}</td>
                  <td><StatusPill status={row.status} /></td>
                  <td>{formatLimit(row)}</td>
                  <td>{formatPurchasePriority(row)}</td>
                  <td>{formatOptionalPercent(row.defaultSubscriptionRate)}</td>
                  <td>{row.redemptionFeeSummary ?? "-"}</td>
                  <td>{formatOperationFees(row)}</td>
                  <td>{formatChannelScope(row.channelScope)}</td>
                  <td>{formatDataDate(row)}</td>
                  <td>{row.source}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatusPill({ status }: { status?: string }) {
  const normalized = normalizeStatus(status);
  return (
    <span className={`status-pill status-pill-${normalized}`} data-status={normalized}>
      {formatStatus(status)}
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

function formatTradingCostHint(turnover?: number | null): string {
  if (turnover == null) return "成交额缺失";
  return "看佣金/买卖价差，成交额越高通常越好";
}

function formatPremiumDiscount(row: { closingPremiumDiscountRate?: number | null; navDate?: string | null; tradeDate?: string | null }): string {
  if (row.closingPremiumDiscountRate == null) return "净值缺失";
  if (!row.navDate) return formatPercent(row.closingPremiumDiscountRate);
  if (row.navDate === row.tradeDate) return `${formatPercent(row.closingPremiumDiscountRate)}（同日净值）`;
  return `${formatPercent(row.closingPremiumDiscountRate)}（按${row.navDate}净值）`;
}

function formatPurchasePriority(row: { status?: string; limitAmountYuan?: number | null; shareClass?: string | null }): string {
  if (row.status === "open") return "优先";
  if (row.status === "suspended") return "不可申购";
  if (row.limitAmountYuan == null) return "待确认";
  if (row.shareClass === "F" || row.limitAmountYuan >= 10000) return "高限额";
  return "低限额";
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

function formatChannelScope(scope?: string): string {
  if (scope === "agency") return "代销共享";
  if (scope === "direct") return "直销/特殊";
  if (scope === "special") return "特殊渠道";
  return "未知";
}

function formatDataDate(row: { limitDataDate?: string | null; feeDataDate?: string | null }): string {
  return row.limitDataDate ?? row.feeDataDate ?? "-";
}
