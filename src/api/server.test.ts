import { describe, expect, it } from "vitest";
import { createInMemoryDatabase } from "../db/database";
import { runDailySync } from "../sync/syncRunner";
import { createApp } from "./server";

describe("local API", () => {
  it("serves index comparison data", async () => {
    const db = createInMemoryDatabase();
    await runDailySync(db);
    const app = createApp(db);
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP server address");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/index-comparison/NASDAQ_100`);
    const data = await response.json();
    server.close();

    expect(response.status).toBe(200);
    expect(data.onExchange.length).toBeGreaterThan(0);
  });
});
