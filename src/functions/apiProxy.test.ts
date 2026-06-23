import { describe, expect, it } from "vitest";
import { buildApiProxyConfig, parseHttpsOrigin, upstreamHostForIp } from "../../functions/api/proxy";

describe("api proxy", () => {
  it("uses HTTPS API_ORIGIN for Cloudflare Tunnel", () => {
    expect(parseHttpsOrigin("https://api.globaletf.store")).toBe("https://api.globaletf.store");
    const config = buildApiProxyConfig(
      new URL("https://globaletf.pages.dev/api/health"),
      "health",
      { API_ORIGIN: "https://api.globaletf.store/" }
    );
    expect(config.mode).toBe("tunnel");
    expect(config.fetchUrl).toBe("https://api.globaletf.store/api/health");
  });

  it("falls back to sslip when no tunnel URL", () => {
    expect(upstreamHostForIp("47.100.5.7")).toBe("47-100-5-7.sslip.io");
    const config = buildApiProxyConfig(new URL("https://globaletf.pages.dev/api/health"), "health", {});
    expect(config.mode).toBe("sslip");
    expect(config.fetchUrl).toBe("http://47-100-5-7.sslip.io/api/health");
    expect(config.originHost).toBe("47.100.5.7");
  });
});
