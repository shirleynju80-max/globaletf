import { describe, expect, it } from "vitest";
import { createInMemoryDatabase } from "../db/database";
import { queryIndexComparison } from "../db/repositories";
import { runDailySync } from "./syncRunner";

describe("sync runner", () => {
  it("writes mock snapshots and keeps them queryable", async () => {
    const db = createInMemoryDatabase();
    await runDailySync(db);
    const result = queryIndexComparison(db, "NASDAQ_100");
    expect(result.onExchange.length).toBeGreaterThan(0);
    expect(result.offExchange.length).toBeGreaterThan(0);
  });
});
