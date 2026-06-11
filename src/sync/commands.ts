import type { SyncArea } from "./syncRunner";

export type SyncCommand = "daily" | "quotes" | "limits" | "fees" | "holdings";

export function syncAreasForCommand(command: SyncCommand): SyncArea[] | undefined {
  if (command === "daily") return undefined;
  if (command === "quotes") return ["quote"];
  if (command === "holdings") return ["holding"];
  return ["offExchange"];
}

export function isSyncCommand(command: string): command is SyncCommand {
  return ["daily", "quotes", "limits", "fees", "holdings"].includes(command);
}
