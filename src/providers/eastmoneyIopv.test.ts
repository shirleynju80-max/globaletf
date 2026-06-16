import { describe, expect, it, vi } from "vitest";
import { fetchFundEstimate, parseFundEstimate } from "./eastmoneyIopv";

describe("parseFundEstimate", () => {
  it("parses disclosed NAV and real-time IOPV estimate", () => {
    const payload = `jsonpgz({"fundcode":"159632","name":"纳斯达克ETF华安","jzrq":"2026-06-11","dwjz":"2.2733","gsz":"2.2872","gszzl":"0.61","gztime":"2026-06-13 04:00"});`;
    expect(parseFundEstimate(payload)).toEqual({
      fundCode: "159632",
      unitNav: 2.2733,
      navDate: "2026-06-11",
      iopv: 2.2872,
      iopvTime: "2026-06-13 04:00"
    });
  });

  it("throws when the payload is not a fundgz response", () => {
    expect(() => parseFundEstimate("not jsonp")).toThrow();
  });
});

describe("fetchFundEstimate", () => {
  it("returns null instead of throwing on network failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(await fetchFundEstimate(fetchImpl, "159632")).toBeNull();
  });

  it("returns parsed estimate on success", async () => {
    const fetchImpl = vi.fn(async () => new Response(
      `jsonpgz({"fundcode":"513100","jzrq":"2026-06-12","dwjz":"1.5","gsz":"1.55","gszzl":"3.3","gztime":"2026-06-15 04:00"});`,
      { status: 200 }
    )) as unknown as typeof fetch;
    expect(await fetchFundEstimate(fetchImpl, "513100")).toMatchObject({ fundCode: "513100", iopv: 1.55 });
  });
});
