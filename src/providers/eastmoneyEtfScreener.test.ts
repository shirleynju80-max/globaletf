import { describe, expect, it, vi } from "vitest";
import { parseEastMoneyEtfScreener, fetchAllEastMoneyEtfScreenerRows } from "./eastmoneyEtfScreener";
import { selectFundsForTarget } from "./eastmoneyFundSearch";

describe("eastmoneyEtfScreener", () => {
  it("parses ETF screener rows", () => {
    expect(parseEastMoneyEtfScreener({
      data: {
        diff: [
          { f12: "159941", f14: "纳指ETF广发" },
          { f12: "159630", f14: "A100ETF汇添富" }
        ]
      }
    })).toEqual([
      { code: "159941", name: "纳指ETF广发", shortName: "纳指ETF广发", type: "指数型-海外股票", pinyin: "" },
      { code: "159630", name: "A100ETF汇添富", shortName: "A100ETF汇添富", type: "指数型-海外股票", pinyin: "" }
    ]);
  });

  it("selects Nasdaq 100 ETFs from screener rows without requiring 100 in the short name", () => {
    const funds = selectFundsForTarget(
      parseEastMoneyEtfScreener({
        data: { diff: [{ f12: "159941", f14: "纳指ETF广发" }] }
      }),
      { targetCode: "NASDAQ_100", targetName: "纳斯达克100", aliases: ["纳指100", "纳斯达克"], seedFundCodes: [] }
    );
    expect(funds.map((fund) => fund.code)).toEqual(["159941"]);
    expect(funds[0].shareClass).toBe("ETF");
  });

  it("paginates screener pages until total is reached", async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input));
      const page = Number(url.searchParams.get("pn"));
      if (page === 1) {
        return Response.json({ data: { total: 3, diff: [{ f12: "159941", f14: "纳指ETF广发" }] } });
      }
      return Response.json({ data: { total: 3, diff: [{ f12: "513100", f14: "纳指ETF" }, { f12: "159632", f14: "纳斯达克ETF华安" }] } });
    }) as typeof fetch;

    const { fetchAllEastMoneyEtfScreenerRows } = await import("./eastmoneyEtfScreener");
    const rows = await fetchAllEastMoneyEtfScreenerRows({ fetchImpl, pageSize: 1, maxPages: 5 });
    expect(rows.map((row) => row.code)).toEqual(["159941", "513100", "159632"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
