import { render, screen } from "@testing-library/react";
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
    expect(screen.getByText("1.20%（按2026-06-07净值）")).toBeInTheDocument();
    expect(screen.getByText("交易成本提示")).toBeInTheDocument();
    expect(screen.getByText("看佣金/买卖价差，成交额越高通常越好")).toBeInTheDocument();
    expect(screen.getByText(/仅供参考/)).toBeInTheDocument();
    expect(screen.getByText(/场内按成交额排序/)).toBeInTheDocument();
    expect(screen.getByText(/场外按开放申购和限额金额排序/)).toBeInTheDocument();
    expect(screen.getByText(/申购费默认展示最低金额段/)).toBeInTheDocument();
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

    expect(screen.getByText("3.66%（按2026-06-11净值）")).toBeInTheDocument();
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
            redemptionFeeSummary: "0-6天: 1.50%; 7-29天: 0.50%",
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
    expect(screen.getByText("数据日期")).toBeInTheDocument();
    expect(screen.getByText("2026-06-09")).toBeInTheDocument();
    expect(screen.getByText("0.12%")).toBeInTheDocument();
    expect(screen.getByText("0-6天: 1.50%; 7-29天: 0.50%")).toBeInTheDocument();
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
    expect(screen.getByText("优先")).toBeInTheDocument();
    expect(screen.getByText("待确认")).toBeInTheDocument();
  });

  it("summarizes off-exchange purchase priority", () => {
    render(
      <IndexComparison
        targetName="纳斯达克100"
        data={{
          onExchange: [],
          offExchange: [
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

    expect(screen.getByText("可买性")).toBeInTheDocument();
    expect(screen.getByText("高限额")).toBeInTheDocument();
    expect(screen.getByText("低限额")).toBeInTheDocument();
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

    expect(container.querySelector('[data-status="suspended"]')).toHaveTextContent("暂停");
    expect(container.querySelector('[data-status="unknown"]')).toHaveTextContent("未知");
    expect(screen.getByText("暂停申购")).toBeInTheDocument();
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
    expect(screen.getByText("暂无标普500场外 A/C/F 数据")).toBeInTheDocument();
  });
});
