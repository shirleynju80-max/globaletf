import { describe, expect, it } from "vitest";
import { withTimeout } from "./requestUtils";

describe("request utilities", () => {
  it("rejects a request after the configured timeout", async () => {
    await expect(withTimeout(new Promise((resolve) => setTimeout(resolve, 50)), 5)).rejects.toThrow("Request timed out after 5ms");
  });
});
