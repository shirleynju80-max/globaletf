import { describe, expect, it } from "vitest";
import { buildApiProxyConfig, buildOriginFetchUrl, upstreamHostForIp } from "../../functions/api/proxy";

describe("api proxy", () => {
  it("derives sslip hostname from origin IP", () => {
    expect(upstreamHostForIp("8.147.67.18")).toBe("8-147-67-18.sslip.io");
  });

  it("builds upstream path for nested routes", () => {
    const url = new URL("https://globaletf.pages.dev/api/live-premium/NASDAQ_100?codes=513100");
    const config = buildApiProxyConfig(url, ["live-premium", "NASDAQ_100"], {});
    expect(config.upstreamPath).toBe("/api/live-premium/NASDAQ_100?codes=513100");
    expect(config.originHost).toBe("8.147.67.18");
    expect(config.upstreamHost).toBe("8-147-67-18.sslip.io");
  });

  it("uses sslip hostname in fetch URL and IP in Host header", () => {
    const config = buildApiProxyConfig(new URL("https://globaletf.pages.dev/api/health"), "health", {});
    expect(buildOriginFetchUrl(config)).toBe("http://8-147-67-18.sslip.io/api/health");
  });
});
