/**
 * Sales channel identifiers for off-exchange purchase limits.
 *
 * Agency rows represent the strictest limit across third-party platforms (union semantics:
 * the user is constrained by the tightest cap among platforms they might use).
 * Direct rows are per fund-company official channels (I/F/E institutional shares).
 */
export type AgencyChannelId = "eastmoney_aggregate" | "alipay" | "tiantian" | "licaitong" | "jd" | "cmb";
export type DirectChannelId = "nfjj" | "bosera" | "gf" | "huaan" | "dc" | "js" | "htbr" | "nf" | "direct_aggregate";
export type ChannelId = AgencyChannelId | DirectChannelId | "aggregate";

/** Platforms we intend to cover for agency-channel limit union (Phase 2). */
export const TARGET_AGENCY_CHANNELS: AgencyChannelId[] = [
  "eastmoney_aggregate",
  "alipay",
  "tiantian",
  "licaitong",
  "jd",
  "cmb"
];

/** Fund-company direct channels for institutional / I-share limits. */
export const TARGET_DIRECT_CHANNELS: DirectChannelId[] = [
  "nfjj",
  "bosera",
  "gf",
  "huaan",
  "dc",
  "js",
  "htbr",
  "nf",
  "direct_aggregate"
];

export function channelIdLabel(channelId: string): string {
  const labels: Record<string, string> = {
    eastmoney_aggregate: "东财代销汇总",
    alipay: "支付宝",
    tiantian: "天天基金",
    licaitong: "微信理财通",
    jd: "京东金融",
    cmb: "招商银行",
    nfjj: "南方基金直销",
    bosera: "博时基金直销",
    gf: "广发基金直销",
    huaan: "华安基金直销",
    dc: "大成基金直销",
    js: "嘉实基金直销",
    htbr: "华泰柏瑞直销",
    nf: "国泰基金直销",
    direct_aggregate: "基金公司直销",
    aggregate: "汇总"
  };
  return labels[channelId] ?? channelId;
}

export function directChannelForCompany(fundCompany?: string): DirectChannelId {
  if (!fundCompany) return "direct_aggregate";
  if (fundCompany.includes("南方")) return "nfjj";
  if (fundCompany.includes("博时")) return "bosera";
  if (fundCompany.includes("广发")) return "gf";
  if (fundCompany.includes("华安")) return "huaan";
  if (fundCompany.includes("大成")) return "dc";
  if (fundCompany.includes("嘉实")) return "js";
  if (fundCompany.includes("华泰柏瑞")) return "htbr";
  if (fundCompany.includes("国泰")) return "nf";
  return "direct_aggregate";
}
