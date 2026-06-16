import { describe, expect, it, vi } from "vitest";
import { fetchFundProfile, parseFundProfile, profileMatchesIndex } from "./eastmoneyFundProfile";

const sampleHtml = `
<table class="info w790">
  <tr>
    <th>跟踪标的</th><td>纳斯达克100指数</td>
    <th>跟踪方式</th><td>完全复制</td>
  </tr>
  <tr>
    <th>业绩比较基准</th><td>纳斯达克100指数收益率(经汇率调整)</td>
  </tr>
</table>`;

describe("parseFundProfile", () => {
  it("extracts tracking index and benchmark from F10 jbgk html", () => {
    expect(parseFundProfile("159632", sampleHtml)).toEqual({
      fundCode: "159632",
      trackingIndex: "纳斯达克100指数",
      benchmark: "纳斯达克100指数收益率(经汇率调整)"
    });
  });

  it("returns nulls when fields are absent", () => {
    expect(parseFundProfile("000001", "<table></table>")).toEqual({ fundCode: "000001", trackingIndex: null, benchmark: null });
  });
});

describe("profileMatchesIndex", () => {
  const profile = parseFundProfile("159632", sampleHtml);

  it("confirms a Nasdaq 100 fund regardless of display name", () => {
    expect(profileMatchesIndex(profile, ["纳斯达克100", "纳指100"])).toBe(true);
  });

  it("rejects look-alike indices such as Nasdaq Biotech", () => {
    const biotech = parseFundProfile("160639", "<th>跟踪标的</th><td>纳斯达克生物科技指数</td>");
    expect(profileMatchesIndex(biotech, ["纳斯达克100", "纳指100"])).toBe(false);
  });
});

describe("fetchFundProfile", () => {
  it("returns null on network failure instead of throwing", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("down");
    }) as unknown as typeof fetch;
    expect(await fetchFundProfile(fetchImpl, "159632")).toBeNull();
  });

  it("retries once when the first profile response is empty", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return new Response("<table></table>", { status: 200 });
      return new Response(sampleHtml, { status: 200 });
    }) as unknown as typeof fetch;
    expect(await fetchFundProfile(fetchImpl, "159632")).toMatchObject({ trackingIndex: "纳斯达克100指数" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
