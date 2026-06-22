import { INDEX_TARGETS } from "./targets";
import { INDEX_TARGETS_PENDING_UNTIL_FUNDS } from "./indexTargetAvailability";

export function formatCountPlus(count: number): string {
  return `${Math.max(count, 0)}+`;
}

/** Round down to the nearest hundred for marketing-style coverage labels, e.g. 615 → 600+. */
export function formatHundredsPlus(count: number): string {
  if (count <= 0) return "0";
  if (count < 100) return `${count}+`;
  const rounded = Math.floor(count / 100) * 100;
  return `${rounded}+`;
}

export function countActiveTrackingIndexTargets(
  pendingAvailability: Record<string, boolean> = {}
): number {
  let count = INDEX_TARGETS.length - INDEX_TARGETS_PENDING_UNTIL_FUNDS.size;
  for (const targetCode of INDEX_TARGETS_PENDING_UNTIL_FUNDS) {
    if (pendingAvailability[targetCode]) count += 1;
  }
  return count;
}

export function buildLandingStats(input: {
  stockIndexCount: number;
  pendingIndexAvailability?: Record<string, boolean>;
}): { trackingIndexLabel: string; stockIndexLabel: string } {
  return {
    trackingIndexLabel: formatCountPlus(countActiveTrackingIndexTargets(input.pendingIndexAvailability ?? {})),
    stockIndexLabel: formatHundredsPlus(input.stockIndexCount)
  };
}
