import { describe, expect, it } from "vitest";
import { parseDirectLimitFromAnnouncement, parseMoneyYuan, parsePurchaseStatus, shouldPersistCompanyPageLimit } from "./limitText";

describe("limitText", () => {
  it("parses purchase status keywords", () => {
    expect(parsePurchaseStatus("限大额")).toBe("limited");
    expect(parsePurchaseStatus("暂停申购")).toBe("suspended");
    expect(parsePurchaseStatus("开放申购")).toBe("open");
  });

  it("skips company-page rows with unknown status and no limit amount", () => {
    expect(shouldPersistCompanyPageLimit("", "")).toBe(false);
    expect(shouldPersistCompanyPageLimit("基金网上交易", "")).toBe(false);
    expect(shouldPersistCompanyPageLimit("暂停申购", "")).toBe(true);
    expect(shouldPersistCompanyPageLimit("", "2.00万元")).toBe(true);
  });

  it("parses yuan amounts with 万/亿 units", () => {
    expect(parseMoneyYuan("2.00万元")).toBe(20000);
    expect(parseMoneyYuan("1.50亿元")).toBe(150000000);
    expect(parseMoneyYuan("无限额")).toBeUndefined();
  });

  it("parses I-class direct limit announcements", () => {
    const parsed = parseDirectLimitFromAnnouncement(
      "自2026年6月10日起，I类基金份额限额2万元，本公司直销渠道个人投资者单日累计申购限额2万元。",
      "I"
    );
    expect(parsed).toMatchObject({
      status: "limited",
      limitAmountYuan: 20000,
      limitUnit: "per_day",
      confidence: 0.95
    });
  });

  it("parses spaced I-class wording from fund-company notices", () => {
    const parsed = parseDirectLimitFromAnnouncement(
      "调整后本基金A类、C类基金份额限额200元，I 类基金份额限额5000元，各类基金份额的申请金额每类单独计算。",
      "I"
    );
    expect(parsed).toMatchObject({
      status: "limited",
      limitAmountYuan: 5000
    });
  });

  it("parses F-class wording from fund-company table notices", () => {
    const parsed = parseDirectLimitFromAnnouncement(
      "投资者通过直销销售机构累计申购嘉实纳斯达克100ETF发起联接（QDII）F人民币的金额不得超过1000元人民币",
      "F"
    );
    expect(parsed).toMatchObject({
      status: "limited",
      limitAmountYuan: 1000,
      confidence: 0.9
    });
  });

  it("parses direct-channel wording without explicit share class", () => {
    const parsed = parseDirectLimitFromAnnouncement("本公司直销渠道个人投资者单日累计申购限额5万元。", "F");
    expect(parsed).toMatchObject({
      status: "limited",
      limitAmountYuan: 50000,
      confidence: 0.8
    });
  });
});
