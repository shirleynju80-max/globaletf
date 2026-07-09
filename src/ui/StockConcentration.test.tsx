import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StockConcentration } from "./StockConcentration";

describe("StockConcentration", () => {
  const defaultProps = {
    returnsByCode: {} as Record<string, import("../domain/fundReturnPeriods").FundReturnSnapshot | undefined>,
    returnsLoading: false,
    onSelectStock: () => undefined,
    expandPeers: false,
    onExpandPeersChange: () => undefined
  };

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
        {...defaultProps}
      />
    );

    expect(screen.getAllByText("NVDA").length).toBeGreaterThan(0);
    expect(screen.getByText("纳指100联接A")).toBeInTheDocument();
    expect(screen.getByText("申购状态")).toBeInTheDocument();
    expect(screen.getByText("限额")).toBeInTheDocument();
    expect(screen.getByText("近1周")).toBeInTheDocument();
    expect(screen.getByText("近1年")).toBeInTheDocument();
    expect(screen.queryByText("排名")).not.toBeInTheDocument();
    expect(screen.getByText("限购")).toBeInTheDocument();
    expect(screen.getByText("1,000 元/日")).toBeInTheDocument();
    expect(screen.getByText("10.10%")).toBeInTheDocument();
    expect(screen.getByText("2026Q1")).toBeInTheDocument();
    expect(screen.getByText("当前查询：英伟达 (NVDA)")).toBeInTheDocument();
  });

  it("formats USD purchase limits in stock concentration rows", () => {
    render(
      <StockConcentration
        selectedStock="NVDA"
        rows={[
          {
            fundCode: "017642",
            fundName: "摩根纳指100美元现汇",
            venue: "off_exchange",
            shareClass: "F",
            stockCode: "NVDA",
            stockName: "英伟达",
            navPercent: 10.1,
            purchaseStatus: "limited",
            limitAmountYuan: null,
            limitAmount: 10,
            limitCurrency: "USD",
            limitUnit: "per_day",
            reportPeriod: "2026Q1",
            source: "eastmoney"
          }
        ]}
        {...defaultProps}
      />
    );

    expect(screen.getByText("10 美元/日")).toBeInTheDocument();
    expect(screen.queryByText("限额待确认")).not.toBeInTheDocument();
  });

  it("submits a custom stock code", () => {
    const onSelectStock = vi.fn();
    render(
      <StockConcentration
        {...defaultProps}
        selectedStock="NVDA"
        rows={[]}
        onSelectStock={onSelectStock}
      />
    );

    fireEvent.change(screen.getByLabelText("股票名称/代码"), { target: { value: "goog" } });
    fireEvent.click(screen.getByRole("button", { name: "查询股票" }));

    expect(onSelectStock).toHaveBeenCalledWith("GOOG");
  });

  it("resolves a Chinese stock alias to the canonical target code", () => {
    const onSelectStock = vi.fn();
    render(
      <StockConcentration
        {...defaultProps}
        selectedStock="NVDA"
        rows={[]}
        onSelectStock={onSelectStock}
      />
    );

    fireEvent.change(screen.getByLabelText("股票名称/代码"), { target: { value: "海力士" } });
    fireEvent.click(screen.getByRole("button", { name: "查询股票" }));

    expect(onSelectStock).toHaveBeenCalledWith("HYNIX");
  });

  it("filters stock concentration rows with combinable venue and purchase filters", () => {
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
            fundCode: "161128",
            fundName: "场内暂停LOF",
            venue: "on_exchange",
            shareClass: "LOF",
            stockCode: "NVDA",
            stockName: "英伟达",
            navPercent: 8.9,
            purchaseStatus: "suspended",
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
        {...defaultProps}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "可申购" }));
    expect(screen.getByText("可申购场外")).toBeInTheDocument();
    expect(screen.getByText("场内ETF")).toBeInTheDocument();
    expect(screen.queryByText("场内暂停LOF")).not.toBeInTheDocument();
    expect(screen.queryByText("暂停场外")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "全部" }));
    fireEvent.click(screen.getByRole("button", { name: "场内" }));
    expect(screen.getByText("场内ETF")).toBeInTheDocument();
    expect(screen.getByText("场内暂停LOF")).toBeInTheDocument();
    expect(screen.queryByText("可申购场外")).not.toBeInTheDocument();
    expect(screen.queryByText("暂停场外")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "可申购" }));
    expect(screen.getByText("场内ETF")).toBeInTheDocument();
    expect(screen.queryByText("场内暂停LOF")).not.toBeInTheDocument();
    expect(screen.queryByText("可申购场外")).not.toBeInTheDocument();
  });

  it("sorts rows when a return column header is clicked", () => {
    render(
      <StockConcentration
        selectedStock="NVDA"
        rows={[
          {
            fundCode: "A",
            fundName: "基金A",
            venue: "off_exchange",
            shareClass: "A",
            stockCode: "NVDA",
            stockName: "英伟达",
            navPercent: 5,
            reportPeriod: "2026Q1",
            source: "eastmoney"
          },
          {
            fundCode: "B",
            fundName: "基金B",
            venue: "off_exchange",
            shareClass: "A",
            stockCode: "NVDA",
            stockName: "英伟达",
            navPercent: 6,
            reportPeriod: "2026Q1",
            source: "eastmoney"
          }
        ]}
        returnsByCode={{
          A: { fundCode: "A", asOfDate: "2026-07-01", returns: { "1m": 0.05, "1w": null, "3m": null, "6m": null, "1y": null } },
          B: { fundCode: "B", asOfDate: "2026-07-01", returns: { "1m": 0.12, "1w": null, "3m": null, "6m": null, "1y": null } }
        }}
        returnsLoading={false}
        expandPeers={false}
        onSelectStock={() => undefined}
        onExpandPeersChange={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "近1月" }));
    const bodyRows = screen.getAllByRole("row").slice(1);
    expect(bodyRows[0]).toHaveTextContent("基金B");
  });

  it("shows the selected stock in the empty state", () => {
    render(
      <StockConcentration
        selectedStock="GOOG"
        rows={[]}
        {...defaultProps}
      />
    );

    expect(screen.getByText("当前查询：谷歌 (GOOG)")).toBeInTheDocument();
    expect(screen.getByText("暂无 谷歌 (GOOG) 持仓数据")).toBeInTheDocument();
  });
});
