import { describe, expect, it, vi } from "vitest";
import { fetchWithTimeout, withTimeout } from "./requestUtils";

describe("request utilities", () => {
  it("rejects a request after the configured timeout", async () => {
    await expect(withTimeout(new Promise((resolve) => setTimeout(resolve, 50)), 5)).rejects.toThrow("Request timed out after 5ms");
  });

  it("aborts fetch after the configured timeout", async () => {
    const fetchImpl = vi.fn((_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      })
    ) as typeof fetch;

    await expect(fetchWithTimeout(fetchImpl, "https://example.test/slow", {}, 5)).rejects.toThrow("Request timed out after 5ms");
    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/slow", expect.objectContaining({
      signal: expect.any(AbortSignal)
    }));
  });
});
