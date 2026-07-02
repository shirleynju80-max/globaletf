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
        return new Response(JSON.stringify({
          data: { diff: [{ f12: "159632", f2: 2.458, f441: 2.2866, f124: Math.floor(priceTimeMs / 1000) }] }
        }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const rows = await fetchLivePremiums(fetchImpl, ["159632"]);
    expect(rows[0].price).toBe(2.458);
    expect(rows[0].iopv).toBe(2.2866);
    expect(rows[0].iopvPremiumDiscountRate).toBeCloseTo((2.458 - 2.2866) / 2.2866, 4);
    expect(rows[0].aligned).toBe(true);
    expect(rows[0].iopvSource).toBe("current");
  });

  it("falls back to prior snapshot IOPV when f441 is missing and fundgz is newer than the price", async () => {
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

  it("uses the live price timestamp instead of a stale cached trade date", async () => {
    const priceTimeMs = Date.UTC(2026, 5, 25, 2, 19);
    const fetchImpl = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      const u = String(url);
      if (u.includes("ulist.np")) {
        return new Response(JSON.stringify({ data: { diff: [{ f12: "161130", f2: 4.671, f441: 0, f124: Math.floor(priceTimeMs / 1000) }] } }), { status: 200 });
      }
      if (u.includes("fundgz.1234567.com.cn")) {
        return new Response(`jsonpgz({"fundcode":"161130","jzrq":"2026-06-23","dwjz":"4.4423","gsz":"4.4240","gszzl":"-0.41","gztime":"2026-06-25 04:00"});`, { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const rows = await fetchLivePremiums(fetchImpl, ["161130"], {
      tradeDateByCode: new Map([["161130", "2026-06-19"]]),
      priorSnapshotsByCode: new Map([["161130", [
        { iopv: 4.5896, iopvTime: "2026-06-19 04:00", iopvTimeMs: parseBeijingTimeMs("2026-06-19 04:00")! }
      ]]])
    });

    expect(rows[0].iopv).toBe(4.424);
    expect(rows[0].iopvTime).toBe("2026-06-25 04:00");
    expect(rows[0].iopvPremiumDiscountRate).toBeCloseTo((4.671 - 4.424) / 4.424, 4);
  });

  it("returns null premium when live price is unavailable", async () => {
    const fetchImpl = vi.fn(async () => new Response("err", { status: 502 })) as unknown as typeof fetch;
    const rows = await fetchLivePremiums(fetchImpl, ["159632"]);
    expect(rows[0].price).toBeNull();
    expect(rows[0].iopvPremiumDiscountRate).toBeNull();
  });

  it("keeps the IOPV estimate when the fund has no live traded price", async () => {
    const priceTimeMs = Date.UTC(2026, 5, 26, 2, 19);
    const fetchImpl = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      const u = String(url);
      if (u.includes("ulist.np")) {
        return new Response(JSON.stringify({
          data: { diff: [{ f12: "513100", f2: 0, f18: 2.208, f441: 2.0036, f124: Math.floor(priceTimeMs / 1000) }] }
        }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const rows = await fetchLivePremiums(fetchImpl, ["513100"]);

    expect(rows[0]).toMatchObject({
      fundCode: "513100",
      price: null,
      iopv: 2.0036,
      iopvTime: "2026-06-26 10:19",
      iopvPremiumDiscountRate: null,
      iopvSource: "current"
    });
  });

  it("matches East Money app premium for 159659-style quote list rows", async () => {
    const fetchImpl = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      if (String(url).includes("ulist.np")) {
        return new Response(JSON.stringify({
          data: { diff: [{ f12: "159659", f2: 2.399, f18: 2.367, f441: 2.2354, f124: 1781594868 }] }
        }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const rows = await fetchLivePremiums(fetchImpl, ["159659"]);
    expect(rows[0].price).toBe(2.399);
    expect(rows[0].iopv).toBe(2.2354);
    expect(rows[0].iopvPremiumDiscountRate).toBeCloseTo(0.0732, 4);
  });

  it("uses disclosed NAV for LOF live premium when quote-list IOPV is unavailable", async () => {
    const priceTimeMs = Date.UTC(2026, 6, 2, 3, 50, 24);
    const fetchImpl = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      const u = String(url);
      if (u.includes("ulist.np")) {
        return new Response(JSON.stringify({
          data: { diff: [{ f12: "161130", f2: 4.646, f441: 0, f124: Math.floor(priceTimeMs / 1000) }] }
        }), { status: 200 });
      }
      if (u.includes("fundgz.1234567.com.cn")) {
        return new Response(`jsonpgz({"fundcode":"161130","jzrq":"2026-06-30","dwjz":"4.5726","gsz":"4.5056","gszzl":"-1.47","gztime":"2026-07-02 04:00"});`, { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const rows = await fetchLivePremiums(fetchImpl, ["161130"], {
      referenceModeByCode: new Map([["161130", "nav"]])
    });

    expect(rows[0].iopv).toBe(4.5726);
    expect(rows[0].iopvTime).toBe("2026-06-30 15:00");
    expect(rows[0].iopvPremiumDiscountRate).toBeCloseTo((4.646 - 4.5726) / 4.5726, 4);
    expect(rows[0].iopvSource).toBe("nav");
  });
});
