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
            limitUnit: "per_day",
            limitDataDate: "2026-06-10",
            reportPeriod: "2026Q1",
            source: "eastmoney"
          }
        ]}
        meta={null}
        onSelectStock={() => undefined}
        expandPeers={false}
        onExpandPeersChange={() => undefined}
      />
    );

    expect(screen.getAllByText("NVDA").length).toBeGreaterThan(0);
    expect(screen.getByText("纳指100联接A")).toBeInTheDocument();
    expect(screen.getByText("申购状态")).toBeInTheDocument();
    expect(screen.getByText("限额")).toBeInTheDocument();
    expect(screen.getByText("限购日期")).toBeInTheDocument();
    expect(screen.getByText("限购")).toBeInTheDocument();
    expect(screen.getByText("1,000 元/日")).toBeInTheDocument();
    expect(screen.getByText("2026-06-10")).toBeInTheDocument();
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
        meta={null}
        onSelectStock={onSelectStock}
        expandPeers={false}
        onExpandPeersChange={() => undefined}
      />
    );

    fireEvent.change(screen.getByLabelText("自定义股票代码"), { target: { value: "goog" } });
    fireEvent.click(screen.getByRole("button", { name: "查询股票" }));

    expect(onSelectStock).toHaveBeenCalledWith("GOOG");
  });

  it("filters stock concentration rows by purchase availability and venue", () => {
    render(
      <StockConcentration
        selectedStock="NVDA"
        rows={[
          {
            fundCode: "000834",
            fundName: "可申购场外",
            venue: "off_exchange",
            shareClass: "A",
            stockCode: "NVDA",
            stockName: "英伟达",
            navPercent: 10.1,
            purchaseStatus: "limited",
            limitAmountYuan: 1000,
            reportPeriod: "2026Q1",
            source: "eastmoney"
          },
          {
            fundCode: "513100",
            fundName: "场内ETF",
            venue: "on_exchange",
            shareClass: "ETF",
            stockCode: "NVDA",
            stockName: "英伟达",
            navPercent: 9.2,
            reportPeriod: "2026Q1",
            source: "eastmoney"
          },
          {
            fundCode: "000001",
            fundName: "暂停场外",
            venue: "off_exchange",
            shareClass: "A",
            stockCode: "NVDA",
            stockName: "英伟达",
            navPercent: 8.8,
            purchaseStatus: "suspended",
            reportPeriod: "2026Q1",
            source: "eastmoney"
          }
        ]}
        meta={null}
        onSelectStock={() => undefined}
        expandPeers={false}
        onExpandPeersChange={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "可申购" }));
    expect(screen.getByText("可申购场外")).toBeInTheDocument();
    expect(screen.getByText("场内ETF")).toBeInTheDocument();
    expect(screen.queryByText("暂停场外")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "场内" }));
    expect(screen.getByText("场内ETF")).toBeInTheDocument();
    expect(screen.queryByText("可申购场外")).not.toBeInTheDocument();
  });

  it("shows the selected stock in the empty state", () => {
    render(
      <StockConcentration
        selectedStock="GOOG"
        rows={[]}
        meta={null}
        onSelectStock={() => undefined}
        expandPeers={false}
        onExpandPeersChange={() => undefined}
      />
    );

    expect(screen.getByText("当前查询：GOOG")).toBeInTheDocument();
    expect(screen.getByText("暂无 GOOG 持仓数据")).toBeInTheDocument();
  });
});
