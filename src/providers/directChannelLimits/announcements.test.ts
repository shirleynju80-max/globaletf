import { describe, expect, it, vi } from "vitest";
import type { Fund } from "../../domain/types";
import {
  announcementFundCodes,
  fetchDirectLimitFromAnnouncements,
  pickLimitAnnouncement
} from "./announcements";
import { parseEastMoneySecurityAnnouncementList } from "./eastmoneyAnnouncements";

const fund: Fund = {
  code: "021000",
  name: "南方纳斯达克100指数发起(QDII)I",
  fundType: "QDII",
  venue: "off_exchange",
  trackingTargetCode: "NASDAQ_100",
  shareClass: "I",
  fundCompany: "南方基金",
  parentFundCode: "016452",
  enabled: true
};

describe("direct announcement limits", () => {
  it("includes parent and sibling A-share codes for announcement lookup", () => {
    expect(announcementFundCodes(fund)).toEqual(expect.arrayContaining(["021000", "016452"]));
  });

  it("parses East Money security announcement list payload", () => {
    const rows = parseEastMoneySecurityAnnouncementList({
      data: {
        list: [{
          art_code: "AN202604081821052975",
          title_ch: "关于调整南方纳斯达克100指数发起式证券投资基金(QDII)申购、定投及转换转入业务金额限制的公告",
          notice_date: "2026-04-08T00:00:00"
        }]
      }
    });
    expect(rows[0]).toMatchObject({ artCode: "AN202604081821052975", noticeDate: "2026-04-08" });
  });

  it("prefers amount-limit announcements over holiday suspension notices", () => {
    const picked = pickLimitAnnouncement([
      { title: "关于旗下部分基金暂停申购赎回等业务的公告", date: "2025-01-07", artCode: "AN1" },
      { title: "关于调整南方纳斯达克100指数发起式证券投资基金(QDII)申购、定投及转换转入业务金额限制的公告", date: "2026-04-08", artCode: "AN2" }
    ]);
    expect(picked?.artCode).toBe("AN2");
  });

  it("fetches direct limit from East Money security announcement detail", async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.includes("np-anotice-stock.eastmoney.com")) {
        return new Response(JSON.stringify({
          data: {
            list: [{
              art_code: "AN202604081821052975",
              title_ch: "关于调整南方纳斯达克100指数发起式证券投资基金(QDII)申购、定投及转换转入业务金额限制的公告",
              notice_date: "2026-04-08T00:00:00"
            }]
          }
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        data: {
          notice_title: "关于调整南方纳斯达克100指数发起式证券投资基金(QDII)申购、定投及转换转入业务金额限制的公告",
          notice_date: "2026-04-08T00:00:00",
          notice_content: "<p>调整后本基金A类、C类基金份额限额200元，I 类基金份额限额5000元，各类基金份额的申请金额每类单独计算。</p>"
        }
      }), { status: 200 });
    }) as typeof fetch;

    const limit = await fetchDirectLimitFromAnnouncements(fetchImpl, fund, "2026-06-15", "run-1", 5000);
    expect(limit).toMatchObject({
      fundCode: "021000",
      shareClass: "I",
      status: "limited",
      limitAmountYuan: 5000,
      channelScope: "direct",
      channelId: "nfjj",
      source: "fundco-announcement-nfjj",
      dataDate: "2026-04-08"
    });
  });
});
