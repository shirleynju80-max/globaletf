import { describe, expect, it } from "vitest";
import { fetchFundReturnSnapshots, tencentSymbol } from "./fundHistoricalReturns";

describe("fundHistoricalReturns", () => {
  it("maps exchange codes to Tencent symbols", () => {
    expect(tencentSymbol("159632")).toBe("sz159632");
    expect(tencentSymbol("513100")).toBe("sh513100");
  });

  it("computes return snapshots from mocked NAV and kline sources", async () => {
    const fetchImpl = (async (url: Parameters<typeof fetch>[0]) => {
      const target = String(url);
      if (target.includes("sz159632")) {
        return new Response(JSON.stringify({
          data: {
            sz159632: {
              day: [
                ["2025-06-20", "1", "2.00", "2", "2", "1"],
                ["2025-07-01", "1", "2.00", "2", "2", "1"],
                ["2026-06-20", "1", "2.20", "2", "2", "1"],
                ["2026-06-25", "1", "2.40", "2", "2", "1"]
              ]
            }
          }
        }), { status: 200 });
      }
      if (target.includes("lsjz") && target.includes("code=000834")) {
        const page = new URL(target).searchParams.get("page") ?? "1";
        if (page === "1") {
          return new Response(
            `<table><tr><td>2026-06-25</td><td class='tor bold'>1.20</td></tr><tr><td>2025-06-20</td><td class='tor bold'>1.00</td></tr></table>`,
            { status: 200 }
          );
        }
        return new Response("<table></table>", { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const snapshots = await fetchFundReturnSnapshots([
      { fundCode: "159632", venue: "on_exchange" },
      { fundCode: "000834", venue: "off_exchange" }
    ], { fetchImpl, asOfDate: "2026-06-25" });

    expect(snapshots["159632"]?.returns["1y"]).toBeCloseTo(0.2, 4);
    expect(snapshots["000834"]?.returns["1y"]).toBeCloseTo(0.2, 4);
  });
});
