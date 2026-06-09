import { openDatabase } from "../db/database";
import { runDailySync } from "./syncRunner";

const command = process.argv[2] ?? "daily";
const db = openDatabase();

if (["daily", "quotes", "limits", "fees", "holdings"].includes(command)) {
  await runDailySync(db, { useLiveProviders: true });
  console.log(`sync:${command} completed`);
} else {
  console.error(`Unknown sync command: ${command}`);
  process.exitCode = 1;
}
