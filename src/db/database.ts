import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { migrate } from "./schema";

export function createInMemoryDatabase(): Database.Database {
  const db = new Database(":memory:");
  migrate(db);
  return db;
}

export function openDatabase(path = "data/etflimit.sqlite"): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  migrate(db);
  return db;
}
