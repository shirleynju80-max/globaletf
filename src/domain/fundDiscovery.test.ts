import { describe, expect, it } from "vitest";
import { matchesDiscoveryNameHint, preferDiscoverySource, formatDiscoverySourceLabel } from "./fundDiscovery";

describe("fundDiscovery", () => {
  it("matches Nasdaq hints for short ETF names without index numbers", () => {
    expect(matchesDiscoveryNameHint("纳指ETF广发", "NASDAQ_100")).toBe(true);
    expect(matchesDiscoveryNameHint("纳指科技ETF景顺", "NASDAQ_100")).toBe(false);
    expect(matchesDiscoveryNameHint("纳指生物科技ETF", "NASDAQ_100")).toBe(false);
    expect(matchesDiscoveryNameHint("A100ETF汇添富", "NASDAQ_100")).toBe(false);
    expect(matchesDiscoveryNameHint("沪深300ETF", "NASDAQ_100")).toBe(false);
  });

  it("does not treat domestic CSI 500 products as S&P 500", () => {
    expect(matchesDiscoveryNameHint("中证500ETF", "SP_500")).toBe(false);
    expect(matchesDiscoveryNameHint("标普500ETF", "SP_500")).toBe(true);
  });

  it("prefers tracking-profile over weaker discovery sources", () => {
    expect(preferDiscoverySource("fundcode-search", "tracking-profile")).toBe("tracking-profile");
    expect(preferDiscoverySource("catalog-seed", "screener-name")).toBe("screener-name");
  });

  it("formats discovery source labels for the UI", () => {
    expect(formatDiscoverySourceLabel("tracking-profile")).toBe("F10校验");
    expect(formatDiscoverySourceLabel("fundcode-search")).toBe("代码库");
    expect(formatDiscoverySourceLabel(undefined)).toBe("-");
  });
});
