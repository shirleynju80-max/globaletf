import { openDatabase } from "../db/database";
import { runAcceptance } from "./acceptance";

const result = runAcceptance(openDatabase());

for (const check of result.checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"} ${check.key}: ${check.message}`);
}

if (!result.ok) {
  process.exitCode = 1;
}
