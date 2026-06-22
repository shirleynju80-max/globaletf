import type { ChannelScope, Fund, ShareClass } from "./types";
import { directChannelForCompany } from "./channels";

/** Funds with OTC subscription limits on East Money F10 (off-exchange + cross-listed LOF). */
export function isOtcPurchaseLimitFund(fund: Fund): boolean {
  return fund.enabled && (fund.venue === "off_exchange" || fund.shareClass === "LOF");
}

export function defaultChannelScopeForShareClass(shareClass: ShareClass): ChannelScope {
  if (shareClass === "F" || shareClass === "I" || shareClass === "E" || shareClass === "Y" || shareClass === "D" || shareClass === "O") {
    return "direct";
  }
  if (shareClass === "A" || shareClass === "C") return "agency";
  return "unknown";
}

export function defaultChannelIdForFund(shareClass: ShareClass, fundCompany?: string): string {
  const scope = defaultChannelScopeForShareClass(shareClass);
  if (scope === "agency") return "eastmoney_aggregate";
  if (scope === "direct") return directChannelForCompany(fundCompany);
  return "aggregate";
}
