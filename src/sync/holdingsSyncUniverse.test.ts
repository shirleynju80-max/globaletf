import { describe, expect, it } from "vitest";
import { mergeFundsForHoldingsSync } from "./holdingsSyncUniverse";
import type { Fund } from "../domain/types";

describe("mergeFundsForHoldingsSync", () => {
  it("includes disabled QDII scan funds for jjcc pulls", () => {
    const product: Fund[] = [
      { code: "513100", name: "纳指ETF", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true }
    ];
    const scan: Fund[] = [
      { code: "539002", name: "建信新兴市场混合(QDII)A", fundType: "QDII", venue: "off_exchange", shareClass: "A", enabled: false, discoverySource: "qdii-holdings-scan" }
    ];

    const merged = mergeFundsForHoldingsSync(product, scan);
    expect(merged.map((fund) => fund.code)).toEqual(["513100", "539002"]);
    expect(merged.find((fund) => fund.code === "539002")?.enabled).toBe(true);
  });
});
