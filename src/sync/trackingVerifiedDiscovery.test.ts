import { describe, expect, it, vi } from "vitest";
import { selectFundsForTargets } from "../providers/eastmoneyFundSearch";
import { discoverOnExchangeFundsByTrackingProfile } from "./trackingVerifiedDiscovery";

describe("trackingVerifiedDiscovery", () => {
  it("adds on-exchange ETFs verified by F10 tracking index", async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.includes("jbgk_159941")) {
        return new Response("<table><tr><th>跟踪标的</th><td>纳斯达克100指数</td></tr></table>", { status: 200 });
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;

    const funds = await discoverOnExchangeFundsByTrackingProfile(
      [{ code: "159941", name: "纳指ETF广发", shortName: "纳指ETF广发", type: "指数型-海外股票", pinyin: "" }],
      [{ targetCode: "NASDAQ_100", targetName: "纳斯达克100", aliases: ["纳指100", "纳斯达克"] }],
      new Set(),
      { fetchImpl, requestTimeoutMs: 5000 }
    );

    expect(funds).toEqual([expect.objectContaining({
      code: "159941",
      trackingTargetCode: "NASDAQ_100",
      venue: "on_exchange",
      shareClass: "ETF",
      discoverySource: "tracking-profile"
    })]);
  });

  it("F10-verifies screener name matches before adding on-exchange ETFs", async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.includes("jbgk_513880")) {
        return new Response("<table><tr><th>跟踪标的</th><td>日经225指数</td></tr></table>", { status: 200 });
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;

    const screenerRows = [
      { code: "513880", name: "日经225ETF", shortName: "日经225ETF", type: "指数型-海外股票", pinyin: "" },
      { code: "159941", name: "纳指ETF广发", shortName: "纳指ETF广发", type: "指数型-海外股票", pinyin: "" }
    ];
    const targets = [{ targetCode: "NIKKEI_225", targetName: "日经225", aliases: ["日经225", "日经 225"], seedFundCodes: ["513880"] }];
    expect(selectFundsForTargets(screenerRows, targets).map((fund) => fund.code)).toEqual(["513880"]);

    const funds = await discoverOnExchangeFundsByTrackingProfile(
      screenerRows,
      targets,
      new Set(),
      { fetchImpl, requestTimeoutMs: 5000 }
    );

    expect(funds).toEqual([expect.objectContaining({
      code: "513880",
      trackingTargetCode: "NIKKEI_225",
      discoverySource: "tracking-profile"
    })]);
  });
});
