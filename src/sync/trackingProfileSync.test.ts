import { describe, expect, it } from "vitest";
import type { Fund } from "../domain/types";
import {
  applyIndexFundVerificationGate,
  disableExcludedDiscoveryNames,
  disableProfileMismatchedFunds,
  type FundTrackingProfileRow
} from "./trackingProfileSync";

const autoFund = (): Fund => ({
  code: "016202",
  name: "汇添富全球汽车产业升级混合(QDII)人民币C",
  fundType: "QDII-混合",
  venue: "off_exchange",
  shareClass: "C",
  trackingTargetCode: "NASDAQ_100",
  enabled: true
});

describe("trackingProfileSync verification gate", () => {
  it("disables index-tagged funds with excluded theme names", () => {
    const result = disableExcludedDiscoveryNames([autoFund()]);
    expect(result[0].enabled).toBe(false);
  });

  it("disables funds whose F10 profile does not match the assigned index", () => {
    const profiles: FundTrackingProfileRow[] = [{
      fundCode: "016202",
      trackingIndex: "该基金无跟踪标的",
      benchmark: "恒生沪港深智能及电动车指数收益率*40%",
      verifiedOk: false,
      verifiedAt: "2026-06-23T00:00:00.000Z"
    }];
    const result = disableProfileMismatchedFunds([autoFund()], profiles);
    expect(result[0].enabled).toBe(false);
  });

  it("keeps verified index funds enabled", () => {
    const fund: Fund = {
      code: "000834",
      name: "大成纳斯达克100ETF联接(QDII)A",
      fundType: "指数型-海外股票",
      venue: "off_exchange",
      shareClass: "A",
      trackingTargetCode: "NASDAQ_100",
      enabled: true
    };
    const profiles: FundTrackingProfileRow[] = [{
      fundCode: "000834",
      trackingIndex: "纳斯达克100指数",
      benchmark: "纳斯达克100指数收益率(经汇率调整)",
      verifiedOk: true,
      verifiedAt: "2026-06-23T00:00:00.000Z"
    }];
    const result = applyIndexFundVerificationGate([fund], profiles);
    expect(result[0].enabled).toBe(true);
    expect(result[0].discoverySource).toBe("tracking-profile");
  });
});
