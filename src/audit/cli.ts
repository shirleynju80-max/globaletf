import { runTrackingIndexAudit } from "./trackingIndexAudit";

async function main(): Promise<void> {
  const result = await runTrackingIndexAudit();

  for (const row of result.rows) {
    const flag = row.ok === true ? "PASS" : row.ok === false ? "FAIL" : "WARN";
    console.log(`${flag} ${row.code} ${row.targetCode ?? "-"} 跟踪标的=${row.trackingIndex ?? "?"} 基准=${row.benchmark ?? "?"} (${row.name})`);
  }

  console.log("");
  console.log(`tracking-index audit: total=${result.rows.length}, mismatch=${result.mismatches.length}, unverified=${result.unverified.length}`);

  if (result.mismatches.length > 0) {
    console.error("Tracking index mismatches detected:");
    for (const row of result.mismatches) {
      console.error(`  ${row.code} ${row.name}: expected ${row.targetCode}, declared 跟踪标的=${row.trackingIndex ?? "?"} / 基准=${row.benchmark ?? "?"}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
