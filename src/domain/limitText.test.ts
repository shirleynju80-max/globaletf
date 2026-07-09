import { describe, expect, it } from "vitest";
import { parseDirectLimitFromAnnouncement, parseMoneyLimit, parseMoneyYuan, parsePurchaseStatus, shouldPersistCompanyPageLimit } from "./limitText";

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

  it("parses USD limit amounts without forcing them into yuan", () => {
    expect(parseMoneyLimit("10.00美元")).toEqual({ amount: 10, currency: "USD" });
    expect(parseMoneyLimit("单日累计申购限额10.00美元")).toEqual({ amount: 10, currency: "USD" });
    expect(parseMoneyYuan("10.00美元")).toBeUndefined();
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

  it("parses USD share direct limit announcements", () => {
    const parsed = parseDirectLimitFromAnnouncement(
      "自2026年3月31日起，美元份额单日累计申购限额10.00美元。",
      "F"
    );

    expect(parsed).toMatchObject({
      status: "limited",
      limitAmountYuan: undefined,
      limitAmount: 10,
      limitCurrency: "USD",
      limitUnit: "per_day"
    });
  });

  it("treats paused large subscriptions with disclosed caps as limited USD amounts", () => {
    const parsed = parseDirectLimitFromAnnouncement(
      "暂停大额申购起始日2026年6月5日。下属分级基金的017641019305017642017643交易代码该分级基金是否暂停大额申购是是是是下属分级基金的限制申购金额10.00元10.00元1.00美元1.00美元下属分级基金的限制定期定额投资金额10.00元10.00元1.00美元1.00美元。单个基金账户单个美元份额类别的单日申购及定期定额投资金额累计限额为1.00美元。",
      "A",
      "017642"
    );

    expect(parsed).toMatchObject({
      status: "limited",
      limitAmountYuan: undefined,
      limitAmount: 1,
      limitCurrency: "USD",
      limitUnit: "per_day"
    });
  });

  it("parses spaced direct-channel tables with USD share columns", () => {
    const parsed = parseDirectLimitFromAnnouncement(
      "下属分级基金的基金简称 摩根标普 500 指数 (QDII) 人民币 A 美钞 人民币 C 美汇 下属分级基金的交易代码 017641 017642 019305 017643 该分级基金是否暂停大额申购、大额转换转入、定期定额投资 是 是 是 是 下属分级基金的限制申购金额（单位：人 300.00 30.00 300.00 30.00 民币元） 下属分级基金的限制转换转入金额（单位：300.00 - 300.00 - 人民币元） 下属分级基金的限制定期定额投资金额 300.00 30.00 300.00 30.00 （单位：人民币元） 注:人民币份额的限制金额单位为人民币元，美元份额的限制金额单位为美元。本基金直销渠道投资者单个基金账户单个美元份额类别的单日申购及定期定额投资金额累计限额为 30.00 美元。",
      "A",
      "017642"
    );

    expect(parsed).toMatchObject({
      status: "limited",
      limitAmountYuan: undefined,
      limitAmount: 30,
      limitCurrency: "USD",
      limitUnit: "per_day"
    });
  });
});
