import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IndexComparison } from "./IndexComparison";

describe("IndexComparison", () => {
  it("labels premium as previous close reference data", () => {
    render(
      <IndexComparison
        targetName="纳斯达克100"
        data={{
          onExchange: [{ code: "513100", name: "纳指ETF", closePrice: 1.23, closingPremiumDiscountRate: 0.012, unitNav: 1.2, navDate: "2026-06-07", turnover: 120000000, tradeDate: "2026-06-08", source: "eastmoney" }],
          offExchange: [{ code: "000834", name: "纳指100联接A", shareClass: "A", status: "limited", limitAmountYuan: 1000, channelScope: "agency", source: "tiantian" }]
        }}
      />
    );

    expect(screen.getByText("昨日收盘折溢价")).toBeInTheDocument();
    expect(screen.getByText("1.20%")).toBeInTheDocument();
    expect(screen.getByText("昨日成交额")).toBeInTheDocument();
    expect(screen.queryByText("交易成本提示")).not.toBeInTheDocument();
  });

  it("sorts on-exchange rows by live or snapshot premium descending", () => {
    render(
      <IndexComparison
        targetName="纳斯达克100"
        data={{
          onExchange: [
            { code: "513100", name: "低溢价", iopvPremiumDiscountRate: 0.05, turnover: 100, tradeDate: "2026-06-10", source: "eastmoney" },
            { code: "159659", name: "高溢价", iopvPremiumDiscountRate: 0.10, turnover: 200, tradeDate: "2026-06-10", source: "eastmoney" }
          ],
          offExchange: []
        }}
      />
    );

    const codes = screen.getAllByRole("cell", { name: /^\d{6}$/ }).map((cell) => cell.textContent);
    expect(codes).toEqual(["159659", "513100"]);
  });

  it("sorts on-exchange rows by turnover when the turnover header is clicked", () => {
    render(
      <IndexComparison
        targetName="纳斯达克100"
        data={{
          onExchange: [
            { code: "513100", name: "低成交", iopvPremiumDiscountRate: 0.10, turnover: 100, tradeDate: "2026-06-10", source: "eastmoney" },
            { code: "159659", name: "高成交", iopvPremiumDiscountRate: 0.05, turnover: 200, tradeDate: "2026-06-10", source: "eastmoney" }
          ],
          offExchange: []
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /昨日成交额/ }));
    const codes = screen.getAllByRole("cell", { name: /^\d{6}$/ }).map((cell) => cell.textContent);
    expect(codes).toEqual(["159659", "513100"]);
  });

  it("sorts on-exchange rows by closing premium when the header is clicked", () => {
    render(
      <IndexComparison
        targetName="纳斯达克100"
        data={{
          onExchange: [
            { code: "513100", name: "低收盘溢价", closingPremiumDiscountRate: 0.01, turnover: 100, tradeDate: "2026-06-10", source: "eastmoney" },
            { code: "159659", name: "高收盘溢价", closingPremiumDiscountRate: 0.04, turnover: 200, tradeDate: "2026-06-10", source: "eastmoney" }
          ],
          offExchange: []
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /昨日收盘折溢价/ }));
    const codes = screen.getAllByRole("cell", { name: /^\d{6}$/ }).map((cell) => cell.textContent);
    expect(codes).toEqual(["159659", "513100"]);
  });

  it("shows the IOPV-based premium as the primary gauge with its estimate time", () => {
    render(
      <IndexComparison
        targetName="纳斯达克100"
        data={{
          onExchange: [{
            code: "159632",
            name: "纳斯达克ETF华安",
            closePrice: 2.458,
            closingPremiumDiscountRate: 0.012,
            unitNav: 2.2733,
            navDate: "2026-06-11",
            iopv: 2.2866,
            iopvTime: "2026-06-13 04:00",
            iopvPremiumDiscountRate: 0.0749,
            turnover: 120000000,
            tradeDate: "2026-06-13",
            source: "eastmoney-on-exchange-spot"
          }],
          offExchange: []
        }}
      />
    );

    expect(screen.getByRole("button", { name: /折溢价（实时）/ })).toBeInTheDocument();
    expect(screen.getByText("7.49%")).toBeInTheDocument();
  });

  it("overlays live premium when background refresh returns newer values", () => {
    render(
      <IndexComparison
        targetName="纳斯达克100"
        data={{
          onExchange: [{ code: "159632", name: "纳斯达克ETF华安", closePrice: 2.376, iopvPremiumDiscountRate: 0.0388, iopvTime: "2026-06-13 04:00", turnover: 120000000, tradeDate: "2026-06-14", source: "eastmoney-on-exchange-spot" }],
          offExchange: []
        }}
        liveAsOf="2026-06-15T04:13:00.000Z"
        livePremiums={{
          "159632": { price: 2.376, priceTime: "2026-06-12T07:00:00.000Z", iopv: 2.25, iopvTime: "2026-06-12 04:00", iopvPremiumDiscountRate: 0.056, aligned: false, iopvSource: "trade_date_match" }
        }}
      />
    );

    expect(screen.getByText(/实时数据更新于/)).toBeInTheDocument();
    expect(screen.getByText("5.60%")).toBeInTheDocument();
  });

  it("shows a clear placeholder when the IOPV estimate is missing", () => {
    render(
      <IndexComparison
        targetName="纳斯达克100"
        data={{
          onExchange: [{ code: "513100", name: "纳指ETF", closePrice: 1.23, closingPremiumDiscountRate: 0.012, iopvPremiumDiscountRate: null, turnover: 120000000, tradeDate: "2026-06-08", source: "eastmoney" }],
          offExchange: []
        }}
      />
    );

    expect(screen.getByText("估值缺失")).toBeInTheDocument();
  });

  it("shows a clear placeholder when NAV is missing", () => {
    render(
      <IndexComparison
        targetName="纳斯达克100"
        data={{
          onExchange: [{ code: "513100", name: "纳指ETF", closePrice: 1.23, closingPremiumDiscountRate: null, turnover: 120000000, tradeDate: "2026-06-08", source: "eastmoney" }],
          offExchange: []
        }}
      />
    );

    expect(screen.getByText("净值缺失")).toBeInTheDocument();
  });

  it("shows the NAV date used for a calculated premium", () => {
    render(
      <IndexComparison
        targetName="纳斯达克100"
        data={{
          onExchange: [{
            code: "159659",
            name: "纳斯达克100ETF招商",
            closePrice: 2.236,
            closingPremiumDiscountRate: 0.0366,
            unitNav: 2.157,
            navDate: "2026-06-11",
            turnover: 417221586.4,
            tradeDate: "2026-06-13",
            source: "eastmoney-on-exchange-spot"
          }],
          offExchange: []
        }}
      />
    );

    expect(screen.getByText("3.66%")).toBeInTheDocument();
  });

  it("shows off-exchange fee cost columns", () => {
    render(
      <IndexComparison
        targetName="纳斯达克100"
        data={{
          onExchange: [],
          offExchange: [{
            code: "000834",
            name: "纳指100联接A",
            shareClass: "A",
            status: "limited",
            limitAmountYuan: 10,
            limitUnit: "per_day",
            channelScope: "agency",
            defaultSubscriptionRate: 0.0012,
            redemptionFeeSummary: "0-6天: 1.5%; 7-29天: 0.5%",
            managementRate: 0.008,
            custodianRate: 0.002,
            salesServiceRate: 0,
            limitDataDate: "2026-06-09",
            source: "tiantian-f10-jjfl"
          }]
        }}
      />
    );

    expect(screen.getByText("申购费")).toBeInTheDocument();
    expect(screen.getByText("10 元/日")).toBeInTheDocument();
    expect(screen.queryByText("生效日")).not.toBeInTheDocument();
    expect(screen.queryByText("同步日")).not.toBeInTheDocument();
    expect(screen.queryByText("来源")).not.toBeInTheDocument();
    expect(screen.getByText("0.12%")).toBeInTheDocument();
    expect(screen.getByText("0-6天: 1.5%; 7-29天: 0.5%")).toBeInTheDocument();
    expect(screen.getByText("0.80% / 0.20% / 0.00%")).toBeInTheDocument();
  });

  it("explains open and unknown off-exchange purchase limits", () => {
    const { container } = render(
      <IndexComparison
        targetName="标普500"
        data={{
          onExchange: [],
          offExchange: [
            {
              code: "050025",
              name: "博时标普500ETF联接A",
              shareClass: "A",
              status: "open",
              limitAmountYuan: null,
              channelScope: "agency",
              source: "tiantian"
            },
            {
              code: "016532",
              name: "未知限额C",
              shareClass: "C",
              status: "limited",
              limitAmountYuan: null,
              channelScope: "agency",
              source: "tiantian"
            }
          ]
        }}
      />
    );

    expect(container.querySelector('[data-status="open"]')).toHaveTextContent("开放");
    expect(container.querySelector('[data-status="limited"]')).toHaveTextContent("限购");
    expect(screen.getByText("开放申购，未披露限额")).toBeInTheDocument();
    expect(screen.getByText("限额待确认")).toBeInTheDocument();
  });

  it("sorts off-exchange rows by purchase limit descending by default", () => {
    render(
      <IndexComparison
        targetName="纳斯达克100"
        data={{
          onExchange: [],
          offExchange: [
            {
              code: "000834",
              name: "纳指100联接A",
              shareClass: "A",
              status: "limited",
              limitAmountYuan: 1000,
              channelScope: "agency",
              source: "tiantian"
            },
            {
              code: "021778",
              name: "广发纳指100ETF联接F",
              shareClass: "F",
              status: "limited",
              limitAmountYuan: 10000,
              channelScope: "direct",
              source: "tiantian"
            },
            {
              code: "050025",
              name: "博时标普500ETF联接A",
              shareClass: "A",
              status: "open",
              limitAmountYuan: null,
              channelScope: "agency",
              source: "tiantian"
            }
          ]
        }}
      />
    );

    const codes = screen.getAllByRole("cell", { name: /^\d{6}$/ }).map((cell) => cell.textContent);
    expect(codes).toEqual(["050025", "021778", "000834"]);
  });

  it("folds suspended off-exchange rows behind a collapsible section", () => {
    render(
      <IndexComparison
        targetName="纳斯达克100"
        data={{
          onExchange: [],
          offExchange: [
            {
              code: "000834",
              name: "纳指100联接A",
              shareClass: "A",
              status: "limited",
              limitAmountYuan: 1000,
              channelScope: "agency",
              source: "tiantian"
            },
            {
              code: "024237",
              name: "博时纳指I",
              shareClass: "I",
              status: "suspended",
              channelScope: "direct",
              source: "fundco-announcement-bosera"
            }
          ]
        }}
      />
    );

    expect(screen.getByText("000834")).toBeInTheDocument();
    expect(screen.queryByText("024237")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /暂停申购（1）/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /暂停申购（1）/ }));
    expect(screen.getByText("024237")).toBeInTheDocument();
  });

  it("marks suspended and unknown purchase statuses distinctly", () => {
    const { container } = render(
      <IndexComparison
        targetName="标普500"
        data={{
          onExchange: [],
          offExchange: [
            {
              code: "000001",
              name: "暂停申购A",
              shareClass: "A",
              status: "suspended",
              channelScope: "agency",
              source: "tiantian"
            },
            {
              code: "000002",
              name: "未知状态C",
              shareClass: "C",
              channelScope: "agency",
              source: "tiantian"
            }
          ]
        }}
      />
    );

    expect(container.querySelector('[data-status="unknown"]')).toHaveTextContent("未知");
    fireEvent.click(screen.getByRole("button", { name: /暂停申购（1）/ }));
    expect(container.querySelector('[data-status="suspended"]')).toHaveTextContent("暂停");
  });

  it("shows empty states for missing on-exchange and off-exchange rows", () => {
    render(
      <IndexComparison
        targetName="标普500"
        data={{
          onExchange: [],
          offExchange: []
        }}
      />
    );

    expect(screen.getByText("暂无标普500场内 ETF/LOF 数据")).toBeInTheDocument();
    expect(screen.getByText("暂无标普500场外基金数据")).toBeInTheDocument();
  });

  it("shows reconciliation flags in the review collapsible section", () => {
    render(
      <IndexComparison
        targetName="纳斯达克100"
        data={{
          onExchange: [],
          offExchange: [{
            code: "021000",
            name: "南方纳指100 I",
            shareClass: "I",
            status: "limited",
            limitAmountYuan: 5000,
            limitUnit: "per_day",
            limitEffectiveDate: "2026-04-08",
            limitSyncedAt: "2026-06-16",
            limitStale: true,
            channelScope: "direct",
            channelId: "nfjj",
            source: "fundco-announcement-nfjj"
          }]
        }}
      />
    );

    expect(screen.getByRole("button", { name: /待核实（1）/ })).toBeInTheDocument();
    expect(screen.queryByText("待核实")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /待核实（1）/ }));
    expect(screen.getByText("待核实")).toBeInTheDocument();
    expect(screen.getByText("直销")).toBeInTheDocument();
  });

  it("shows discovery source labels and highlights direct-channel rows in the unified off-exchange table", () => {
    const { container } = render(
      <IndexComparison
        targetName="纳斯达克100"
        data={{
          onExchange: [{
            code: "513100",
            name: "纳指ETF",
            closePrice: 1.23,
            closingPremiumDiscountRate: 0.012,
            turnover: 120000000,
            tradeDate: "2026-06-08",
            source: "eastmoney",
            discoverySource: "tracking-profile"
          }],
          offExchange: [
            {
              code: "021000",
              name: "南方纳指100 I",
              shareClass: "I",
              status: "limited",
              limitAmountYuan: 5000,
              limitUnit: "per_day",
              channelScope: "direct",
              channelId: "nfjj",
              source: "fundco-announcement-nfjj"
            },
            {
              code: "000834",
              name: "纳指100联接A",
              shareClass: "A",
              status: "limited",
              limitAmountYuan: 1000,
              channelScope: "agency",
              source: "tiantian"
            }
          ]
        }}
      />
    );

    expect(screen.getByText("场外基金")).toBeInTheDocument();
    expect(container.querySelector(".row-direct-limit")).toBeTruthy();
    expect(screen.getByText("5,000 元/日")).toBeInTheDocument();
    expect(screen.queryByText("可买性")).not.toBeInTheDocument();
  });

});
