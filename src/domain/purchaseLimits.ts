import type { ChannelScope, ShareClass } from "./types";
import { directChannelForCompany } from "./channels";

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
