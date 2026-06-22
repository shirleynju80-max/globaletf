import { describe, expect, it } from "vitest";
import { buildIndexPreviewRows } from "./landingPreview";

describe("landingPreview", () => {
  it("builds on-exchange preview rows with live premium and turnover", () => {
    const rows = buildIndexPreviewRows(
      [
        { code: "513100", name: "纳指ETF", closingPremiumDiscountRate: 0.012, iopvPremiumDiscountRate: 0.0071, turnover: 1200000000 },
        { code: "159632", name: "纳斯达克ETF华安", closingPremiumDiscountRate: 0.009, iopvPremiumDiscountRate: 0.0045, turnover: 320000000 },
        { code: "159659", name: "纳指100ETF", closingPremiumDiscountRate: 0.0085, iopvPremiumDiscountRate: 0.0038, turnover: 280000000 },
        { code: "000834", name: "纳指100联接A", closingPremiumDiscountRate: null, iopvPremiumDiscountRate: null, turnover: null }
      ],
      {
        "159632": { iopvPremiumDiscountRate: 0.0055 }
      }
    );

    expect(rows.map((row) => row.code)).toEqual(["513100", "159632", "159659"]);
    expect(rows[0]).toMatchObject({ premium: "+0.71%", closing: "+1.20%", tail: "12.0 亿" });
    expect(rows[1].premium).toBe("+0.55%");
    expect(rows.some((row) => row.code === "000834")).toBe(false);
  });
});
