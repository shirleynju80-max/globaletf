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
    expect(screen.getByText(/使用备用\/缓存数据/)).toBeInTheDocument();
    expect(screen.getByText(/原因anti_scraping/)).toBeInTheDocument();
    expect(screen.getByText(/F10 blocked/)).toBeInTheDocument();
    expect(screen.getByText(/持仓：正常/)).toBeInTheDocument();
    expect(screen.getByText(/280条/)).toBeInTheDocument();
  });

  it("explains fund local-cache fallback without exposing raw backend messages", () => {
    render(
      <DataStatus
        status={{
          fund: {
            area: "fund",
            status: "fallback",
            source: "local-cache",
            dataDate: "2026-06-26",
            itemCount: 364,
            freshItemCount: 0,
            cachedItemCount: 364,
            durationMs: 1105,
            errorCategory: null,
            message: "terminated",
            updatedAt: "2026-06-26T00:31:04.322Z"
          }
        }}
      />
    );

    const fundStatus = screen.getByText(/基金：沿用缓存/);
    expect(fundStatus).toHaveTextContent("基金列表本次发现未完成，已使用最近可用列表");
    expect(fundStatus).toHaveTextContent("本地缓存");
    expect(fundStatus).toHaveTextContent("364条");
    expect(fundStatus).toHaveTextContent("刷新0条");
    expect(fundStatus).toHaveTextContent("缓存364条");
    expect(screen.queryByText(/terminated/)).not.toBeInTheDocument();
  });
});
