import { describe, expect, it } from "vitest";
import { createInMemoryDatabase } from "../db/database";
import { queryFundReturnSnapshots, upsertFundReturnSnapshots } from "../db/repositories";
import { syncFundReturns } from "./fundReturnSync";

describe("fundReturnSync", () => {
  it("stores fetched return snapshots for enabled funds", async () => {
    const db = createInMemoryDatabase();
    db.prepare(`
      INSERT INTO funds (code, name, fund_type, venue, share_class, enabled)
      VALUES ('000834', '测试基金', 'QDII', 'off_exchange', 'A', 1)
    `).run();

    const fetchImpl = (async (url: Parameters<typeof fetch>[0]) => {
      const target = String(url);
      if (target.includes("lsjz") && target.includes("code=000834")) {
        return new Response(
          `<table><tr><td>2025-06-20</td><td class='tor bold'>1.00</td></tr><tr><td>2026-06-25</td><td class='tor bold'>1.20</td></tr></table>`,
          { status: 200 }
        );
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const status = await syncFundReturns(db, "sync-test", [{
      code: "000834",
      name: "测试基金",
      fundType: "QDII",
      venue: "off_exchange",
      shareClass: "A",
      enabled: true
    }], { fetchImpl });

    const cached = queryFundReturnSnapshots(db, ["000834"]);
    expect(status.itemCount).toBe(1);
    expect(cached["000834"]?.returns["1y"]).toBeCloseTo(0.2, 4);
  });

  it("round-trips stored snapshots through the repository", () => {
    const db = createInMemoryDatabase();
    upsertFundReturnSnapshots(db, [{
      snapshot: {
        fundCode: "513100",
        asOfDate: "2026-07-06",
        returns: { "1w": 0.01, "1m": 0.02, "3m": 0.03, "6m": 0.04, "1y": 0.05 }
      },
      venue: "on_exchange"
    }], "sync-test", "2026-07-07T00:00:00.000Z");

    expect(queryFundReturnSnapshots(db, ["513100"])["513100"]?.returns["6m"]).toBeCloseTo(0.04, 4);
  });
});
