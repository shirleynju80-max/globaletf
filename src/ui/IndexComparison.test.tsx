import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IndexComparison } from "./IndexComparison";

describe("IndexComparison", () => {
  it("labels premium as previous close reference data", () => {
    render(
      <IndexComparison
        targetName="纳斯达克100"
        data={{
          onExchange: [{ code: "513100", name: "纳指ETF", closePrice: 1.23, closingPremiumDiscountRate: 0.012, turnover: 120000000, tradeDate: "2026-06-08", source: "eastmoney" }],
          offExchange: [{ code: "000834", name: "纳指100联接A", shareClass: "A", status: "limited", limitAmountYuan: 1000, channelScope: "agency", source: "tiantian" }]
        }}
      />
    );

    expect(screen.getByText("昨日收盘折溢价")).toBeInTheDocument();
    expect(screen.getByText(/仅供参考/)).toBeInTheDocument();
  });
});
