import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { StatusPage } from "./StatusPage";

vi.mock("../api/client", () => ({
  fetchSyncStatus: vi.fn()
}));

import { fetchSyncStatus } from "../api/client";

describe("StatusPage", () => {
  beforeEach(() => {
    vi.mocked(fetchSyncStatus).mockResolvedValue({
      fund: { area: "fund", status: "ok", source: "eastmoney", dataDate: "2026-06-20", itemCount: 100, updatedAt: "2026-06-20T08:30:00.000Z" },
      quote: { area: "quote", status: "error", source: "eastmoney", dataDate: null, itemCount: 0, errorCategory: "network", message: "timeout", updatedAt: "2026-06-20T08:30:00.000Z" }
    });
  });

  it("renders sync status and highlights errors", async () => {
    render(<StatusPage />);
    await waitFor(() => {
      expect(screen.getByText(/基金：正常/)).toBeInTheDocument();
    });
    expect(screen.getByText(/行情：失败/)).toBeInTheDocument();
    expect(screen.getByText(/quote：同步失败/)).toBeInTheDocument();
  });

  it("explains fallback or cached data without implying the whole sync failed", async () => {
    vi.mocked(fetchSyncStatus).mockResolvedValue({
      fund: { area: "fund", status: "fallback", source: "local-cache", dataDate: "2026-06-26", itemCount: 364, freshItemCount: 0, cachedItemCount: 364, message: "terminated", updatedAt: "2026-06-26T00:31:04.322Z" },
      quote: { area: "quote", status: "ok", source: "eastmoney", dataDate: "2026-06-26", itemCount: 20, updatedAt: "2026-06-26T00:31:04.322Z" }
    });

    render(<StatusPage />);
    await waitFor(() => {
      expect(screen.getByText(/基金：沿用缓存/)).toBeInTheDocument();
    });

    expect(screen.getByText(/备用源\/缓存表示该数据域本次未完全刷新/)).toBeInTheDocument();
    expect(screen.getByText(/其他已入库数据仍会继续更新/)).toBeInTheDocument();
  });
});
