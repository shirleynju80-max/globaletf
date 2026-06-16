import { describe, expect, it, vi } from "vitest";
import type { Fund } from "../domain/types";
import { runTrackingIndexAudit } from "./trackingIndexAudit";

const funds: Fund[] = [
  { code: "159632", name: "纳斯达克ETF华安", fundType: "指数型-海外股票", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true },
  { code: "160639", name: "误归类生物科技", fundType: "指数型-海外股票", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "A", enabled: true },
  { code: "999999", name: "无法核实", fundType: "指数型-海外股票", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "A", enabled: true }
];

describe("runTrackingIndexAudit", () => {
  it("confirms matches, flags mismatches, and marks unverifiable funds", async () => {
    const fetchImpl = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      const u = String(url);
      if (u.includes("jbgk_159632")) return new Response("<th>跟踪标的</th><td>纳斯达克100指数</td>", { status: 200 });
      if (u.includes("jbgk_160639")) return new Response("<th>跟踪标的</th><td>纳斯达克生物科技指数</td>", { status: 200 });
      return new Response("err", { status: 502 });
    }) as unknown as typeof fetch;

    const result = await runTrackingIndexAudit(fetchImpl, funds, 3);

    expect(result.rows.find((row) => row.code === "159632")?.ok).toBe(true);
    expect(result.mismatches.map((row) => row.code)).toEqual(["160639"]);
    expect(result.unverified.map((row) => row.code)).toEqual(["999999"]);
  });
});
