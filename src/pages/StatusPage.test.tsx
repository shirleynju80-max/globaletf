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
});
