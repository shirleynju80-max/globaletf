import type { ChannelScope, ShareClass } from "./types";

export function defaultChannelScopeForShareClass(shareClass: ShareClass): ChannelScope {
  if (shareClass === "F") return "direct";
  if (shareClass === "A" || shareClass === "C") return "agency";
  return "unknown";
}
