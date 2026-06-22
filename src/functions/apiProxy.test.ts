import { describe, expect, it } from "vitest";
import { buildApiProxyTarget } from "../../functions/api/proxy";

describe("buildApiProxyTarget", () => {
  it("maps /api/health to origin backend", () => {
    const url = new URL("https://globaletf.pages.dev/api/health");
    expect(buildApiProxyTarget("http://8.147.67.18", url, "health")).toBe("http://8.147.67.18/api/health");
  });

  it("preserves query string and nested paths", () => {
    const url = new URL("https://globaletf.pages.dev/api/live-premium/NASDAQ_100?codes=513100");
    expect(buildApiProxyTarget("http://8.147.67.18/", url, ["live-premium", "NASDAQ_100"])).toBe(
      "http://8.147.67.18/api/live-premium/NASDAQ_100?codes=513100"
    );
  });
});
