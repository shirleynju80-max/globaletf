import { describe, expect, it } from "vitest";
import type { DataProvider } from "./types";
import { runProviderChain } from "./providerChain";

describe("runProviderChain", () => {
  it("uses the first valid provider result", async () => {
    const providers: DataProvider<number>[] = [
      { name: "primary", fetch: async () => ({ ok: true, data: 1, source: "primary", dataDate: "2026-06-09", confidence: 0.9 }) },
      { name: "secondary", fetch: async () => ({ ok: true, data: 2, source: "secondary", dataDate: "2026-06-09", confidence: 0.8 }) }
    ];

    const result = await runProviderChain(providers);

    expect(result.data).toBe(1);
    expect(result.providerResults).toHaveLength(1);
    expect(result.providerResults[0]).toMatchObject({ providerName: "primary", confidence: 0.9 });
  });

  it("falls back when primary provider fails", async () => {
    const providers: DataProvider<number>[] = [
      { name: "primary", fetch: async () => ({ ok: false, errorCategory: "anti_scraping", message: "blocked" }) },
      { name: "secondary", fetch: async () => ({ ok: true, data: 2, source: "secondary", dataDate: "2026-06-09", confidence: 0.8 }) }
    ];

    const result = await runProviderChain(providers);

    expect(result.data).toBe(2);
    expect(result.providerResults.map((entry) => entry.providerName)).toEqual(["primary", "secondary"]);
    expect(result.providerResults[1]).toMatchObject({ providerName: "secondary", confidence: 0.8 });
  });
});
