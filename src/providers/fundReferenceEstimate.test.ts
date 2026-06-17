import { describe, expect, it, vi } from "vitest";
import { fetchFundReferenceEstimate } from "./fundReferenceEstimate";

describe("fetchFundReferenceEstimate", () => {
  it("returns fundgz IOPV when available", async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const u = String(input);
      if (u.includes("fundgz.1234567.com.cn")) {
        return new Response(`jsonpgz({"fundcode":"159659","jzrq":"2026-06-12","dwjz":"2.1696","gsz":"2.2327","gszzl":"2.91","gztime":"2026-06-16 04:00"});`, { status: 200 });
      }
      return new Response("not found", { status: 500 });
    });

    const result = await fetchFundReferenceEstimate(fetchImpl as unknown as typeof fetch, "159659");

    expect(result).toMatchObject({
      fundCode: "159659",
      iopv: 2.2327,
      iopvTime: "2026-06-16 04:00"
    });
  });

  it("falls back to disclosed NAV when fundgz has no IOPV", async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const u = String(input);
      if (u.includes("fundgz.1234567.com.cn")) {
        return new Response("jsonpgz();", { status: 200 });
      }
      if (u.includes("F10DataApi.aspx")) {
        return new Response(`var apidata={content:"<table><tbody><tr><td>2026-06-12</td><td>1.4200</td></tr></tbody></table>",records:1};`, { status: 200 });
      }
      return new Response("not found", { status: 500 });
    });

    const result = await fetchFundReferenceEstimate(fetchImpl as unknown as typeof fetch, "513880");

    expect(result).toMatchObject({
      fundCode: "513880",
      unitNav: 1.42,
      navDate: "2026-06-12",
      iopv: 1.42,
      iopvTime: "2026-06-12 15:00"
    });
  });
});
