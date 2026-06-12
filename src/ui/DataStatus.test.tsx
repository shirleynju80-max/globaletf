import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataStatus } from "./DataStatus";

describe("DataStatus", () => {
  it("renders persisted sync status details", () => {
    render(
      <DataStatus
        status={{
          fund: { area: "fund", status: "ok", source: "eastmoney-fundcode-search", dataDate: "2026-06-10", itemCount: 87, durationMs: 900, updatedAt: "2026-06-10T09:30:00.000Z" },
          quote: { area: "quote", status: "ok", source: "eastmoney-on-exchange-quote", dataDate: "2026-06-09", itemCount: 5, freshItemCount: 1, cachedItemCount: 4, durationMs: 1280, updatedAt: "2026-06-10T09:30:00.000Z" },
          purchaseLimit: { area: "purchaseLimit", status: "fallback", source: "tiantian", dataDate: "2026-06-10", itemCount: 32, errorCategory: "anti_scraping", message: "F10 blocked", updatedAt: "2026-06-10T09:30:00.000Z" },
          fee: { area: "fee", status: "ok", source: "tiantian-f10-jjfl", dataDate: "2026-06-10", itemCount: 180, updatedAt: "2026-06-10T09:30:00.000Z" },
          holding: { area: "holding", status: "ok", source: "eastmoney-f10-jjcc", dataDate: "2026Q1", itemCount: 280, updatedAt: "2026-06-10T09:30:00.000Z" }
        }}
      />
    );

    expect(screen.getByText(/基金：正常/)).toBeInTheDocument();
    expect(screen.getByText(/87条/)).toBeInTheDocument();
    expect(screen.getByText(/行情：正常/)).toBeInTheDocument();
    expect(screen.getByText(/2026-06-09/)).toBeInTheDocument();
    expect(screen.getByText(/刷新1条/)).toBeInTheDocument();
    expect(screen.getByText(/缓存4条/)).toBeInTheDocument();
    expect(screen.getByText(/耗时1.3s/)).toBeInTheDocument();
    expect(screen.getAllByText(/同步2026-06-10 17:30/)).toHaveLength(5);
    expect(screen.getByText(/限购：备用源/)).toBeInTheDocument();
    expect(screen.getByText(/原因anti_scraping/)).toBeInTheDocument();
    expect(screen.getByText(/F10 blocked/)).toBeInTheDocument();
    expect(screen.getByText(/持仓：正常/)).toBeInTheDocument();
    expect(screen.getByText(/280条/)).toBeInTheDocument();
  });
});
