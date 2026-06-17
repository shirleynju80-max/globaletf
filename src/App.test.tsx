import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { fetchDiscoveryHealth, fetchIndexComparison, fetchLivePremium, fetchStockConcentration, fetchSyncStatus, fetchTargets } from "./api/client";

vi.mock("./api/client", () => ({
  fetchTargets: vi.fn(),
  fetchIndexComparison: vi.fn(),
  fetchDiscoveryHealth: vi.fn(),
  fetchLivePremium: vi.fn(),
  fetchStockConcentration: vi.fn(),
  fetchSyncStatus: vi.fn()
}));

type IndexComparisonData = Awaited<ReturnType<typeof fetchIndexComparison>>;

const emptyComparison: IndexComparisonData = { onExchange: [], offExchange: [] };

describe("App", () => {
  beforeEach(() => {
    vi.mocked(fetchTargets).mockResolvedValue([
      { code: "NASDAQ_100", name: "纳斯达克100", type: "index", aliases: [], region: "US", displayOrder: 1 },
      { code: "SP_500", name: "标普500", type: "index", aliases: [], region: "US", displayOrder: 2 },
      { code: "NVDA", name: "英伟达", type: "stock", aliases: [], region: "US", displayOrder: 101 }
    ]);
    vi.mocked(fetchIndexComparison).mockResolvedValue(emptyComparison);
    vi.mocked(fetchDiscoveryHealth).mockResolvedValue({
      targetCode: "NASDAQ_100",
      manifestCount: 0,
      onExchangeCount: 0,
      profileBackedOnExchange: 0,
      profileGaps: [],
      coverageGaps: []
    });
    vi.mocked(fetchStockConcentration).mockResolvedValue({
      rows: [],
      meta: {
        reportPeriod: null,
        dataSource: "fund_holdings",
        totalBeforeDedupe: 0,
        collapsedIndexPeers: 0
      }
    });
    vi.mocked(fetchSyncStatus).mockResolvedValue({});
    vi.mocked(fetchLivePremium).mockResolvedValue({ asOf: "2026-06-16T08:00:00.000Z", rows: [] });
  });

  it("reloads index comparison when selecting another index target", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "标普500" }));

    await waitFor(() => {
      expect(fetchIndexComparison).toHaveBeenCalledWith("SP_500");
    });
    expect(await screen.findByRole("heading", { name: "标普500 同标的产品比较" })).toBeInTheDocument();
  });

  it("ignores stale index comparison responses after switching targets", async () => {
    const nasdaqRequest = deferred<typeof emptyComparison>();
    const sp500Request = deferred<typeof emptyComparison>();
    vi.mocked(fetchIndexComparison).mockImplementation((targetCode: string) => {
      if (targetCode === "NASDAQ_100") return nasdaqRequest.promise;
      if (targetCode === "SP_500") return sp500Request.promise;
      return Promise.resolve(emptyComparison);
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "标普500" }));

    await act(async () => {
      sp500Request.resolve({
        onExchange: [{ code: "513500", name: "标普ETF", closePrice: 1, closingPremiumDiscountRate: 0, turnover: 1, tradeDate: "2026-06-10", source: "test" }],
        offExchange: []
      });
    });
    expect(await screen.findByText("标普ETF")).toBeInTheDocument();

    await act(async () => {
      nasdaqRequest.resolve({
        onExchange: [{ code: "513100", name: "纳指ETF", closePrice: 1, closingPremiumDiscountRate: 0, turnover: 1, tradeDate: "2026-06-10", source: "test" }],
        offExchange: []
      });
    });

    await waitFor(() => {
      expect(screen.queryByText("纳指ETF")).not.toBeInTheDocument();
    });
    expect(screen.getByText("标普ETF")).toBeInTheDocument();
  });

  it("keeps fallback index comparison limit units visible", async () => {
    vi.mocked(fetchIndexComparison).mockRejectedValue(new Error("API unavailable"));

    render(<App />);

    expect(await screen.findByText("1,000 元/日")).toBeInTheDocument();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
