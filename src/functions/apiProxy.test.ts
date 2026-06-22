import { describe, expect, it } from "vitest";
import { buildApiProxyConfig, buildOriginFetchUrl, parseIpv4Origin } from "../../functions/api/proxy";

describe("api proxy", () => {
  it("parses IPv4 from API_ORIGIN", () => {
    expect(parseIpv4Origin("http://8.147.67.18")).toBe("8.147.67.18");
    expect(parseIpv4Origin("https://globaletf.store")).toBeNull();
  });

  it("builds upstream path for nested routes", () => {
    const url = new URL("https://globaletf.pages.dev/api/live-premium/NASDAQ_100?codes=513100");
    const config = buildApiProxyConfig(url, ["live-premium", "NASDAQ_100"], {});
    expect(config.upstreamPath).toBe("/api/live-premium/NASDAQ_100?codes=513100");
    expect(config.resolveIp).toBe("8.147.67.18");
    expect(config.originHost).toBe("8.147.67.18");
  });

  it("uses non-IP hostname in fetch URL for Cloudflare", () => {
    const config = buildApiProxyConfig(new URL("https://globaletf.pages.dev/api/health"), "health", {});
    expect(buildOriginFetchUrl(config)).toBe("http://globaletf-origin.internal/api/health");
  });
});
