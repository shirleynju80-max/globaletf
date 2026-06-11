import { describe, expect, it, vi } from "vitest";
import type { Fund } from "../domain/types";
import { createEastMoneyHoldingsProvider, parseEastMoneyHoldingsPage } from "./eastmoneyHoldings";

const samplePage = `var apidata={ content:"<div class='box'><div class='boxitem w790'><h4 class='t'><label class='left'>2023年3季度股票投资明细</label><label class='right'>截止至：<font class='px12'>2023-08-31</font></label></h4><table><tbody><tr><td>1</td><td><a>AAPL</a></td><td><a>苹果</a></td><td>--</td><td>--</td><td>资讯</td><td>5.09%</td><td>10.45</td><td>12,847.91</td></tr><tr><td>2</td><td><a>NVDA</a></td><td><a>英伟达</a></td><td>--</td><td>--</td><td>资讯</td><td>2.04%</td><td>1.65</td><td>5,156.93</td></tr></tbody></table></div></div>",arryear:[2023,2022],curyear:2025};`;

describe("eastmoney holdings provider", () => {
  it("parses F10 holding rows", () => {
    const rows = parseEastMoneyHoldingsPage({
      fundCode: "000834",
      html: samplePage,
      syncRunId: "run-1"
    });

    expect(rows).toContainEqual(expect.objectContaining({
      fundCode: "000834",
      stockCode: "NVDA",
      stockName: "英伟达",
      navPercent: 2.04,
      holdingMarketValue: 51569300,
      reportPeriod: "2023Q3",
      source: "eastmoney-f10-jjcc"
    }));
  });

  it("falls back to available holding years when the current year is empty", async () => {
    const fund: Fund = { code: "000834", name: "纳指100联接A", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "A", enabled: true };
    const requestedUrls: string[] = [];
    const fetchImpl = (async (url: string) => {
      requestedUrls.push(url);
      return {
        ok: true,
        text: async () => url.includes("year=2023")
          ? samplePage
          : `var apidata={ content:"",arryear:[2023,2022],curyear:2025};`
      } as Response;
    }) as typeof fetch;

    const result = await createEastMoneyHoldingsProvider([fund], {
      fetchImpl,
      years: [2025],
      syncRunId: "run-1"
    }).fetch();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(requestedUrls.some((url) => url.includes("year=2025"))).toBe(true);
    expect(requestedUrls.some((url) => url.includes("year=2023"))).toBe(true);
    expect(result.data).toContainEqual(expect.objectContaining({ fundCode: "000834", stockCode: "NVDA" }));
  });

  it("limits concurrent holding requests and skips timed out funds", async () => {
    const funds: Fund[] = [
      { code: "000834", name: "纳指100联接A", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "A", enabled: true },
      { code: "016533", name: "纳指100联接C", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "C", enabled: true },
      { code: "513390", name: "纳指100ETF", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true }
    ];
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      if (url.includes("016533")) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        activeRequests -= 1;
        return new Response(samplePage, { status: 200 });
      }
      activeRequests -= 1;
      return new Response(samplePage, { status: 200 });
    }) as typeof fetch;

    const result = await createEastMoneyHoldingsProvider(funds, {
      fetchImpl,
      years: [2023],
      syncRunId: "run-1",
      concurrency: 2,
      requestTimeoutMs: 15
    }).fetch();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(maxActiveRequests).toBeLessThanOrEqual(2);
    expect([...new Set(result.data.map((row) => row.fundCode))]).toEqual(["000834", "513390"]);
  });
});
