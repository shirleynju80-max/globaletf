import { describe, expect, it } from "vitest";
import type { Fund } from "../domain/types";
import { mergeFundsForLimitsSync } from "./limitsSyncUniverse";

const lofFund: Fund = {
  code: "161128",
  name: "易方达标普信息科技指数(QDII-LOF)A(人民币)",
  fundType: "QDII",
  venue: "on_exchange",
  shareClass: "LOF",
  enabled: true
};

describe("mergeFundsForLimitsSync", () => {
  it("adds supplemental LOF funds missing from the product snapshot", () => {
    const merged = mergeFundsForLimitsSync(
      [{ code: "513100", name: "纳指ETF", fundType: "ETF", venue: "on_exchange", shareClass: "ETF", enabled: true }],
      [lofFund]
    );

    expect(merged.map((fund) => fund.code)).toEqual(expect.arrayContaining(["513100", "161128"]));
  });

  it("skips on-exchange ETFs without OTC subscription pages", () => {
    const merged = mergeFundsForLimitsSync(
      [],
      [{ code: "513100", name: "纳指ETF", fundType: "ETF", venue: "on_exchange", shareClass: "ETF", enabled: true }]
    );

    expect(merged).toEqual([]);
  });
});
