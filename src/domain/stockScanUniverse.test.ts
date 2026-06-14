import { describe, expect, it } from "vitest";
import { STOCK_SCAN_FUNDS } from "./stockScanUniverse";

describe("stock concentration scan universe", () => {
  it("includes curated non-index QDII funds for stock concentration scans", () => {
    expect(STOCK_SCAN_FUNDS).toContainEqual(expect.objectContaining({
      code: "539002",
      name: "建信新兴市场混合(QDII)A",
      venue: "off_exchange",
      trackingTargetCode: undefined,
      shareClass: "A",
      enabled: true
    }));
  });
});
