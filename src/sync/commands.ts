import type { SyncArea } from "./syncRunner";

export type SyncCommand = "daily" | "quotes" | "limits" | "fees" | "holdings" | "returns";

export function syncAreasForCommand(command: SyncCommand): SyncArea[] | undefined {
  if (command === "daily") return undefined;
  if (command === "quotes") return ["quote"];
  if (command === "holdings") return ["holding"];
  if (command === "returns") return ["returns"];
  return ["offExchange"];
}

export function isSyncCommand(command: string): command is SyncCommand {
  return ["daily", "quotes", "limits", "fees", "holdings", "returns"].includes(command);
}
