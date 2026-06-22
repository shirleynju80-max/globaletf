import { describe, expect, it } from "vitest";
import { mergeQuoteListIopv, parseEastMoneyQuoteListRows, spotCloseFromQuoteRow } from "./eastmoneyQuoteList";

describe("eastmoneyQuoteList", () => {
  it("parses last price, previous close, and IOPV f441 from ulist.np", () => {
    const rows = parseEastMoneyQuoteListRows({
      data: {
        diff: [{
          f12: "159659",
          f2: 2.399,
          f18: 2.367,
          f6: 417221586.4,
          f124: 1781594868,
          f441: 2.2354
        }]
      }
    });
    expect(rows[0]).toMatchObject({
      fundCode: "159659",
      lastPrice: 2.399,
      previousClose: 2.367,
      iopv: 2.2354,
      priceTimeMs: 1781594868000
    });
  });

  it("prefers quote-list IOPV over fundgz in merge", () => {
    const merged = mergeQuoteListIopv(
      { fundCode: "159659", lastPrice: 2.399, previousClose: 2.367, turnover: null, iopv: 2.2354, priceTimeMs: 1781594868000 },
      { fundCode: "159659", unitNav: 2.1696, navDate: "2026-06-12", iopv: 2.2327, iopvTime: "2026-06-16 04:00" },
      "2026-06-16"
    );
    expect(merged?.iopv).toBe(2.2354);
    expect(merged?.iopvTime).toMatch(/2026-06-16/);
  });

  it("uses last price for spot close when available", () => {
    const spot = spotCloseFromQuoteRow({
      fundCode: "159659",
      lastPrice: 2.399,
      previousClose: 2.367,
      turnover: 100,
      iopv: 2.2354,
      priceTimeMs: Date.UTC(2026, 5, 16, 7, 0)
    }, "2026-06-16");
    expect(spot?.closePrice).toBe(2.399);
    expect(spot?.tradeDate).toBe("2026-06-16");
  });
});
