import { describe, expect, it } from "vitest";
import { createInMemoryDatabase } from "../db/database";
import { insertSnapshotBundle } from "../db/repositories";
import {
  enrichQuoteWithMatchedIopv,
  normalizeOnExchangeQuoteSource,
  pairSessionCloseWithQuoteListIopv,
  queryPriorIopvSnapshots
} from "./iopvQuoteEnrichment";

describe("pairSessionCloseWithQuoteListIopv", () => {
  it("pairs kline close with quote-list f441 IOPV", () => {
    const paired = pairSessionCloseWithQuoteListIopv(
      {
        fundCode: "159632",
        closePrice: 2.478,
        closingPremiumDiscountRate: 0.08,
        tradeDate: "2026-06-15",
        source: "eastmoney-on-exchange-quote",
        syncRunId: "run-1"
      },
      {
        fundCode: "159632",
        lastPrice: 2.514,
        previousClose: 2.478,
        turnover: null,
        iopv: 2.356,
        priceTimeMs: Date.UTC(2026, 5, 16, 7, 34)
      }
    );

    expect(paired?.iopv).toBe(2.356);
    expect(paired?.iopvPremiumDiscountRate).toBeCloseTo((2.478 - 2.356) / 2.356, 4);
    expect(paired?.iopvAligned).toBe(true);
  });
});

describe("enrichQuoteWithMatchedIopv", () => {
  it("uses quote-list f441 even when fundgz 04:00 IOPV would fail alignment", () => {
    const db = createInMemoryDatabase();
    const enriched = enrichQuoteWithMatchedIopv(
      db,
      {
        fundCode: "159632",
        closePrice: 2.478,
        closingPremiumDiscountRate: 0.08,
        iopv: 2.30,
        iopvTime: "2026-06-16 04:00",
        iopvPremiumDiscountRate: (2.478 - 2.30) / 2.30,
        tradeDate: "2026-06-15",
        source: "eastmoney-on-exchange-quote",
        syncRunId: "run-1"
      },
      { fundCode: "159632", unitNav: null, navDate: null, iopv: 2.30, iopvTime: "2026-06-16 04:00" },
      null,
      {
        fundCode: "159632",
        lastPrice: 2.514,
        previousClose: 2.478,
        turnover: null,
        iopv: 2.356,
        priceTimeMs: Date.UTC(2026, 5, 16, 7, 34)
      }
    );

    expect(enriched.iopv).toBe(2.356);
    expect(enriched.iopvPremiumDiscountRate).toBeCloseTo((2.478 - 2.356) / 2.356, 4);
    expect(enriched.iopvAligned).toBe(true);
  });

  it("falls back to prior snapshot IOPV when quote-list and alignment both fail", () => {
    const db = createInMemoryDatabase();
    insertSnapshotBundle(db, {
      syncRunId: "seed",
      funds: [{ code: "159632", name: "纳斯达克ETF华安", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true }],
      quotes: [{
        fundCode: "159632",
        closePrice: 2.376,
        closingPremiumDiscountRate: 0.04,
        iopv: 2.25,
        iopvTime: "2026-06-12 04:00",
        iopvPremiumDiscountRate: 0.056,
        tradeDate: "2026-06-12",
        source: "eastmoney-on-exchange-quote",
        syncRunId: "seed"
      }],
      limits: [],
      fees: [],
      holdings: []
    });
    expect(queryPriorIopvSnapshots(db, "159632")).toHaveLength(1);

    const enriched = enrichQuoteWithMatchedIopv(
      db,
      {
        fundCode: "159632",
        closePrice: 2.376,
        closingPremiumDiscountRate: 0.04,
        tradeDate: "2026-06-12",
        source: "eastmoney-on-exchange-quote",
        syncRunId: "run-1"
      },
      { fundCode: "159632", unitNav: null, navDate: null, iopv: 2.30, iopvTime: "2026-06-15 04:00" },
      null,
      null
    );

    expect(enriched.iopv).toBe(2.25);
    expect(enriched.iopvPremiumDiscountRate).toBeCloseTo(0.056, 3);
  });
});

describe("normalizeOnExchangeQuoteSource", () => {
  it("collapses spot rows into the canonical on-exchange quote source", () => {
    expect(normalizeOnExchangeQuoteSource({
      fundCode: "513390",
      closePrice: 2.42,
      closingPremiumDiscountRate: null,
      tradeDate: "2026-06-10",
      source: "eastmoney-on-exchange-spot",
      syncRunId: "run-1"
    }).source).toBe("eastmoney-on-exchange-quote");
  });
});
