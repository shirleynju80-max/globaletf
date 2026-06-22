import { describe, expect, it } from "vitest";
import type { StockConcentrationRow } from "../db/repositories";
import { isStockRowPurchasable, matchesStockConcentrationFilters, toggleStockConcentrationFilter } from "./stockConcentrationFilters";

const onEtf: StockConcentrationRow = {
  fundCode: "513100",
  fundName: "场内ETF",
  venue: "on_exchange",
  shareClass: "ETF",
  stockCode: "NVDA",
  stockName: "英伟达",
  navPercent: 9,
  reportPeriod: "2026Q1",
  source: "eastmoney"
};

const onLofSuspended: StockConcentrationRow = {
  ...onEtf,
  fundCode: "161128",
  fundName: "暂停LOF",
  shareClass: "LOF",
  purchaseStatus: "suspended"
};

const offLimited: StockConcentrationRow = {
  ...onEtf,
  fundCode: "000834",
  fundName: "场外限购",
  venue: "off_exchange",
  shareClass: "A",
  purchaseStatus: "limited"
};

const offSuspended: StockConcentrationRow = {
  ...offLimited,
  fundCode: "000001",
  fundName: "暂停场外",
  purchaseStatus: "suspended"
};

describe("stockConcentrationFilters", () => {
  it("excludes suspended rows and keeps tradable on-exchange ETFs purchasable", () => {
    expect(isStockRowPurchasable(onEtf)).toBe(true);
    expect(isStockRowPurchasable(onLofSuspended)).toBe(false);
    expect(isStockRowPurchasable(offLimited)).toBe(true);
    expect(isStockRowPurchasable(offSuspended)).toBe(false);
  });

  it("combines venue and purchasable filters", () => {
    expect(matchesStockConcentrationFilters(onEtf, ["on_exchange", "purchasable"])).toBe(true);
    expect(matchesStockConcentrationFilters(onLofSuspended, ["on_exchange", "purchasable"])).toBe(false);
    expect(matchesStockConcentrationFilters(onLofSuspended, ["on_exchange"])).toBe(true);
    expect(matchesStockConcentrationFilters(offLimited, ["on_exchange", "purchasable"])).toBe(false);
    expect(matchesStockConcentrationFilters(offLimited, ["off_exchange", "purchasable"])).toBe(true);
    expect(matchesStockConcentrationFilters(offSuspended, ["purchasable"])).toBe(false);
  });

  it("toggles filters on and off", () => {
    expect(toggleStockConcentrationFilter([], "on_exchange")).toEqual(["on_exchange"]);
    expect(toggleStockConcentrationFilter(["on_exchange", "purchasable"], "on_exchange")).toEqual(["purchasable"]);
  });
});
