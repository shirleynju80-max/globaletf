export interface OffExchangePartitionRow {
  status?: string;
  limitStale?: boolean;
  limitStatusConflict?: boolean;
}

export function needsLimitReview(row: OffExchangePartitionRow): boolean {
  return Boolean(row.limitStale);
}

export function partitionOffExchangeRows<T extends OffExchangePartitionRow>(
  rows: T[]
): { active: T[]; review: T[]; suspended: T[] } {
  const active: T[] = [];
  const review: T[] = [];
  const suspended: T[] = [];
  for (const row of rows) {
    if (row.status === "suspended") suspended.push(row);
    else if (needsLimitReview(row)) review.push(row);
    else active.push(row);
  }
  return { active, review, suspended };
}
