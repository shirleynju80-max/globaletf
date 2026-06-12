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
    expect(screen.getByText(/场内按成交额排序/)).toBeInTheDocument();
    expect(screen.getByText(/场外按开放申购和限额金额排序/)).toBeInTheDocument();
  });

  it("shows a clear placeholder when same-date NAV is missing", () => {
    render(
      <IndexComparison
        targetName="纳斯达克100"
        data={{
          onExchange: [{ code: "513100", name: "纳指ETF", closePrice: 1.23, closingPremiumDiscountRate: null, turnover: 120000000, tradeDate: "2026-06-08", source: "eastmoney" }],
          offExchange: []
        }}
      />
    );

    expect(screen.getByText("同日净值缺失")).toBeInTheDocument();
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
            channelScope: "agency",
            defaultSubscriptionRate: 0.0012,
            redemptionFeeSummary: "0-6天: 1.50%; 7-29天: 0.50%",
            managementRate: 0.008,
            custodianRate: 0.002,
            salesServiceRate: 0,
            source: "tiantian-f10-jjfl"
          }]
        }}
      />
    );

    expect(screen.getByText("申购费")).toBeInTheDocument();
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
