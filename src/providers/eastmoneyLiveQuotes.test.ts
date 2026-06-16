import { describe, expect, it, vi } from "vitest";
import { parseBeijingTimeMs } from "../domain/iopvAlignment";
import { fetchLivePremiums, parseLivePrices } from "./eastmoneyLiveQuotes";

describe("parseLivePrices", () => {
  it("maps fund codes to latest prices and skips invalid rows", () => {
    const map = parseLivePrices({
      data: {
        diff: [
          { f12: "159632", f2: 2.458, f124: 1781496792 },
          { f12: "513100", f2: 0 },
          { f12: "", f2: 1.2 }
        ]
      }
    });
    expect(map.get("159632")).toEqual({ price: 2.458, priceTimeMs: 1781496792000 });
    expect(map.has("513100")).toBe(false);
  });
});

describe("fetchLivePremiums", () => {
  it("combines live price and IOPV into a premium when aligned", async () => {
    const priceTimeMs = Date.UTC(2026, 5, 13, 6, 30);
    const fetchImpl = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      const u = String(url);
      if (u.includes("ulist.np")) {
        return new Response(JSON.stringify({ data: { diff: [{ f12: "159632", f2: 2.458, f124: Math.floor(priceTimeMs / 1000) }] } }), { status: 200 });
      }
      if (u.includes("fundgz.1234567.com.cn")) {
        return new Response(`jsonpgz({"fundcode":"159632","jzrq":"2026-06-11","dwjz":"2.2733","gsz":"2.2866","gszzl":"0.5","gztime":"2026-06-13 04:00"});`, { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const rows = await fetchLivePremiums(fetchImpl, ["159632"]);
    expect(rows[0].price).toBe(2.458);
    expect(rows[0].iopv).toBe(2.2866);
    expect(rows[0].aligned).toBe(true);
    expect(rows[0].iopvSource).toBe("current");
  });

  it("falls back to prior snapshot IOPV when current estimate is newer than the price", async () => {
    const priceTimeMs = Date.UTC(2026, 5, 12, 7, 0);
    const fetchImpl = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      const u = String(url);
      if (u.includes("ulist.np")) {
        return new Response(JSON.stringify({ data: { diff: [{ f12: "159632", f2: 2.376, f124: Math.floor(priceTimeMs / 1000) }] } }), { status: 200 });
      }
      if (u.includes("fundgz.1234567.com.cn")) {
        return new Response(`jsonpgz({"fundcode":"159632","jzrq":"2026-06-11","dwjz":"2.2733","gsz":"2.30","gszzl":"0.5","gztime":"2026-06-15 04:00"});`, { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const rows = await fetchLivePremiums(fetchImpl, ["159632"], {
      priorSnapshotsByCode: new Map([["159632", [
        { iopv: 2.2872, iopvTime: "2026-06-13 04:00", iopvTimeMs: parseBeijingTimeMs("2026-06-13 04:00")! },
        { iopv: 2.25, iopvTime: "2026-06-12 04:00", iopvTimeMs: parseBeijingTimeMs("2026-06-12 04:00")! }
      ]]])
    });
    expect(rows[0].aligned).toBe(false);
    expect(rows[0].iopvSource).toBe("trade_date_match");
    expect(rows[0].iopv).toBe(2.25);
  });

  it("returns null premium when live price is unavailable", async () => {
    const fetchImpl = vi.fn(async () => new Response("err", { status: 502 })) as unknown as typeof fetch;
    const rows = await fetchLivePremiums(fetchImpl, ["159632"]);
    expect(rows[0].price).toBeNull();
    expect(rows[0].iopvPremiumDiscountRate).toBeNull();
  });
});
