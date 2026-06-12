import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
            holdingMarketValue: 120000000,
            purchaseStatus: "limited",
            limitAmountYuan: 1000,
            reportPeriod: "2026Q1",
            source: "eastmoney"
          }
        ]}
        onSelectStock={() => undefined}
      />
    );

    expect(screen.getAllByText("NVDA").length).toBeGreaterThan(0);
    expect(screen.getByText("纳指100联接A")).toBeInTheDocument();
    expect(screen.getByText("申购状态")).toBeInTheDocument();
    expect(screen.getByText("限额")).toBeInTheDocument();
    expect(screen.getByText("限购")).toBeInTheDocument();
    expect(screen.getByText("1,000 元")).toBeInTheDocument();
    expect(screen.getByText("1.20 亿")).toBeInTheDocument();
    expect(screen.getByText("10.10%")).toBeInTheDocument();
    expect(screen.getByText("2026Q1")).toBeInTheDocument();
    expect(screen.getByText("当前查询：NVDA")).toBeInTheDocument();
  });

  it("submits a custom stock code", () => {
    const onSelectStock = vi.fn();
    render(
      <StockConcentration
        selectedStock="NVDA"
        rows={[]}
        onSelectStock={onSelectStock}
      />
    );

    fireEvent.change(screen.getByLabelText("自定义股票代码"), { target: { value: "goog" } });
    fireEvent.click(screen.getByRole("button", { name: "查询股票" }));

    expect(onSelectStock).toHaveBeenCalledWith("GOOG");
  });

  it("shows the selected stock in the empty state", () => {
    render(
      <StockConcentration
        selectedStock="GOOG"
        rows={[]}
        onSelectStock={() => undefined}
      />
    );

    expect(screen.getByText("当前查询：GOOG")).toBeInTheDocument();
    expect(screen.getByText("暂无 GOOG 持仓数据")).toBeInTheDocument();
  });
});
