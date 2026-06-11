import { openDatabase } from "../db/database";
import { runDailySync } from "./syncRunner";
import { isSyncCommand, syncAreasForCommand } from "./commands";

const command = process.argv[2] ?? "daily";
const db = openDatabase();

if (isSyncCommand(command)) {
  await runDailySync(db, { useLiveProviders: true, areas: syncAreasForCommand(command) });
  console.log(`sync:${command} completed`);
} else {
  console.error(`Unknown sync command: ${command}`);
  process.exitCode = 1;
}
