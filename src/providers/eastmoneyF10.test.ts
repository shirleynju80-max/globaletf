import { describe, expect, it, vi } from "vitest";
import type { Fund } from "../domain/types";
import { createEastMoneyF10OffExchangeProvider, parseEastMoneyF10FeesAndLimits } from "./eastmoneyF10";

const baseFund: Fund = {
  code: "000834",
  name: "大成纳斯达克100ETF联接(QDII)A",
  fundType: "QDII",
  venue: "off_exchange",
  trackingTargetCode: "NASDAQ_100",
  shareClass: "A",
  enabled: true
};

const sampleHtml = `
  <table><tbody>
    <tr><td class="th w110">申购状态</td><td class="w135">限大额</td><td class="th w110">赎回状态</td><td class="w135">开放赎回</td></tr>
  </tbody></table>
  <h4 class="t"><label class="left">申购与赎回金额</label></h4>
  <table><tbody>
    <tr><td class="th w110">申购起点</td><td>10.00元</td><td class="th w110">日累计申购限额</td><td>10.00元</td></tr>
  </tbody></table>
  <h4 class="t"><label class="left">运作费用</label></h4>
  <table><tbody>
    <tr><td class="th w110">管理费率</td><td>0.80%（每年）</td><td class="th w110">托管费率</td><td>0.20%（每年）</td><td class="th w110">销售服务费率</td><td>0.00%（每年）</td></tr>
  </tbody></table>
  <h4 class="t"><label class="left">申购费率</label></h4>
  <table><tbody>
    <tr><td>小于50万元</td><td><strike class='gray'>1.20%</strike>&nbsp;&nbsp;|&nbsp;&nbsp;0.12%</td></tr>
    <tr><td>大于等于50万元，小于200万元</td><td><strike class='gray'>1.00%</strike>&nbsp;&nbsp;|&nbsp;&nbsp;0.10%</td></tr>
    <tr><td>大于等于1000万元</td><td>每笔1000元</td></tr>
  </tbody></table>
  <h4 class="t"><label class="left">赎回费率<a name="shfl"></a></label></h4>
  <table><tbody>
    <tr><td>小于7天</td><td>1.50%</td></tr>
    <tr><td>大于等于7天，小于1年</td><td>0.50%</td></tr>
    <tr><td>大于等于2年</td><td>0.00%</td></tr>
  </tbody></table>
`;

describe("East Money F10 parser", () => {
  it("extracts purchase limits and fee tiers from Tiantian F10 HTML", () => {
    const result = parseEastMoneyF10FeesAndLimits({
      fund: baseFund,
      html: sampleHtml,
      dataDate: "2026-06-09",
      syncRunId: "run-1"
    });

    expect(result.limit).toMatchObject({
      fundCode: "000834",
      shareClass: "A",
      status: "limited",
      limitAmountYuan: 10,
      channelScope: "agency",
      source: "tiantian-f10-jjfl"
    });
    expect(result.fees).toContainEqual(expect.objectContaining({ feeType: "subscription", rate: 0.0012, amountTierLowerBound: 0, amountTierUpperBound: 500000 }));
    expect(result.fees).toContainEqual(expect.objectContaining({ feeType: "subscription", rate: 0.001, amountTierLowerBound: 500000, amountTierUpperBound: 2000000 }));
    expect(result.fees).toContainEqual(expect.objectContaining({ feeType: "redemption", rate: 0.015, minHoldingDays: 0, maxHoldingDays: 6 }));
    expect(result.fees).toContainEqual(expect.objectContaining({ feeType: "redemption", rate: 0.005, minHoldingDays: 7, maxHoldingDays: 364 }));
    expect(result.fees).toContainEqual(expect.objectContaining({ feeType: "management", rate: 0.008 }));
    expect(result.fees).toContainEqual(expect.objectContaining({ feeType: "custodian", rate: 0.002 }));
    expect(result.fees).toContainEqual(expect.objectContaining({ feeType: "sales_service", rate: 0 }));
  });

  it("uses direct channel scope for F class funds", () => {
    const result = parseEastMoneyF10FeesAndLimits({
      fund: { ...baseFund, code: "020123", shareClass: "F" },
      html: sampleHtml,
      dataDate: "2026-06-09",
      syncRunId: "run-1"
    });

    expect(result.limit.channelScope).toBe("direct");
    expect(result.fees.every((fee) => fee.channelScope === "direct")).toBe(true);
  });
});

describe("East Money F10 provider", () => {
  it("fetches one F10 page per enabled off-exchange fund", async () => {
    const fetchImpl = vi.fn(async () => new Response(sampleHtml, { status: 200 }));
    const provider = createEastMoneyF10OffExchangeProvider([baseFund], {
      fetchImpl,
      dataDate: "2026-06-09",
      syncRunId: "run-1"
    });

    const result = await provider.fetch();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fetchImpl).toHaveBeenCalledWith("https://fundf10.eastmoney.com/jjfl_000834.html", expect.objectContaining({ headers: expect.any(Object) }));
    expect(result.data.limits).toHaveLength(1);
    expect(result.data.fees.length).toBeGreaterThan(0);
  });

  it("keeps successful fund results when one F10 page fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(sampleHtml, { status: 200 }))
      .mockResolvedValueOnce(new Response("blocked", { status: 403 }));
    const provider = createEastMoneyF10OffExchangeProvider(
      [
        baseFund,
        { ...baseFund, code: "016533", name: "嘉实纳斯达克100ETF发起联接(QDII)C人民币", shareClass: "C" }
      ],
      {
        fetchImpl,
        dataDate: "2026-06-09",
        syncRunId: "run-1"
      }
    );

    const result = await provider.fetch();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.limits.map((limit) => limit.fundCode)).toEqual(["000834"]);
  });
});
