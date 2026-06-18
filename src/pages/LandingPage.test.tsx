import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { LandingPage } from "./LandingPage";

vi.mock("../api/client", () => ({
  fetchIndexComparison: vi.fn(),
  fetchLivePremium: vi.fn(),
  fetchStockConcentration: vi.fn(),
  fetchLandingStats: vi.fn()
}));

import { fetchIndexComparison, fetchLandingStats, fetchLivePremium, fetchStockConcentration } from "../api/client";

describe("LandingPage", () => {
  beforeEach(() => {
    vi.mocked(fetchIndexComparison).mockResolvedValue({
      onExchange: [
        { code: "513100", name: "纳指ETF", venue: "on_exchange", shareClass: "ETF", closingPremiumDiscountRate: 0.012, iopvPremiumDiscountRate: 0.0071, turnover: 1200000000 },
        { code: "159632", name: "纳斯达克ETF华安", venue: "on_exchange", shareClass: "ETF", closingPremiumDiscountRate: 0.009, iopvPremiumDiscountRate: 0.0045, turnover: 320000000 }
      ],
      offExchange: [{ code: "000834", name: "纳指100联接A", venue: "off_exchange", shareClass: "A", closingPremiumDiscountRate: null, status: "limited", limitAmountYuan: 1000 }]
    });
    vi.mocked(fetchLivePremium).mockResolvedValue({
      asOf: "2026-06-17T04:00:00.000Z",
      rows: [{ fundCode: "513100", name: "纳指ETF", price: 1.2, priceTime: null, iopv: 1.19, iopvTime: null, iopvPremiumDiscountRate: 0.0071, aligned: true, iopvSource: "current" }]
    });
    vi.mocked(fetchStockConcentration).mockResolvedValue({
      rows: [
        {
          fundCode: "539002",
          fundName: "建信新兴市场混合",
          venue: "off_exchange",
          shareClass: "A",
          stockCode: "NVDA",
          stockName: "英伟达",
          navPercent: 10.14,
          fundKind: "主动/QDII",
          reportPeriod: "2026Q1",
          source: "eastmoney"
        }
      ],
      meta: { reportPeriod: "2026Q1", dataSource: "stock_fund_index", totalBeforeDedupe: 1, collapsedIndexPeers: 0 }
    });
    vi.mocked(fetchLandingStats).mockResolvedValue({
      trackingIndexCount: 4,
      stockIndexCount: 615,
      trackingIndexLabel: "4+",
      stockIndexLabel: "600+"
    });
  });

  it("renders two product entry points with live index preview rows", async () => {
    const pushState = vi.spyOn(window.history, "pushState").mockImplementation(() => undefined);
    const dispatch = vi.spyOn(window, "dispatchEvent");

    render(<LandingPage />);

    expect(screen.getByRole("heading", { name: /跨境基金/ })).toBeInTheDocument();
    expect(screen.getByText("净值占比")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("跟踪指数")).toBeInTheDocument();
      expect(screen.getByText("600+")).toBeInTheDocument();
    });
    expect(screen.queryByText("000834")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("159632")).toBeInTheDocument();
    });
    const premiumCell = screen.getByText("513100").closest("tr")?.querySelector(".col-premium");
    expect(premiumCell).toHaveTextContent("+0.71%");

    fireEvent.click(screen.getAllByRole("button", { name: "指数跟踪" })[0]);

    expect(pushState).toHaveBeenCalledWith({}, "", "/indices");
    expect(dispatch).toHaveBeenCalled();
  });
});
