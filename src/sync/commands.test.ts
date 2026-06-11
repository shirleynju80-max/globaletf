import { describe, expect, it } from "vitest";
import { isSyncCommand, syncAreasForCommand } from "./commands";

describe("sync commands", () => {
  it("maps CLI commands to sync areas", () => {
    expect(syncAreasForCommand("daily")).toBeUndefined();
    expect(syncAreasForCommand("quotes")).toEqual(["quote"]);
    expect(syncAreasForCommand("limits")).toEqual(["offExchange"]);
    expect(syncAreasForCommand("fees")).toEqual(["offExchange"]);
    expect(syncAreasForCommand("holdings")).toEqual(["holding"]);
  });

  it("rejects unknown commands", () => {
    expect(isSyncCommand("quotes")).toBe(true);
    expect(isSyncCommand("unknown")).toBe(false);
  });
});
