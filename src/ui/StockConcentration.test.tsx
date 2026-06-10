import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StockConcentration } from "./StockConcentration";

describe("StockConcentration", () => {
  it("shows stock concentration ranking rows", () => {
    render(
      <StockConcentration
        selectedStock="NVDA"
        rows={[
          {
            fundCode: "000834",
            fundName: "纳指100联接A",
            venue: "off_exchange",
            shareClass: "A",
            stockCode: "NVDA",
            stockName: "英伟达",
            navPercent: 10.1,
            reportPeriod: "2026Q1",
            source: "eastmoney"
          }
        ]}
        onSelectStock={() => undefined}
      />
    );

    expect(screen.getAllByText("NVDA").length).toBeGreaterThan(0);
    expect(screen.getByText("纳指100联接A")).toBeInTheDocument();
    expect(screen.getByText("10.10%")).toBeInTheDocument();
    expect(screen.getByText("2026Q1")).toBeInTheDocument();
  });
});
