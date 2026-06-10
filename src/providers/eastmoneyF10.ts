import { defaultChannelScopeForShareClass } from "../domain/purchaseLimits";
import type { FeeTier, Fund, PurchaseLimit, PurchaseStatus } from "../domain/types";
import type { DataProvider, ProviderFetchResult } from "./types";

const SOURCE = "tiantian-f10-jjfl";

export interface OffExchangeFeeLimitSnapshot {
  limits: PurchaseLimit[];
  fees: FeeTier[];
}

interface ParseInput {
  fund: Fund;
  html: string;
  dataDate: string;
  syncRunId: string;
}

interface ProviderOptions {
  fetchImpl?: typeof fetch;
  dataDate?: string;
  syncRunId?: string;
}

export function parseEastMoneyF10FeesAndLimits(input: ParseInput): { limit: PurchaseLimit; fees: FeeTier[] } {
  const channelScope = defaultChannelScopeForShareClass(input.fund.shareClass);
  const statusText = lookupCellAfterLabel(input.html, "申购状态");
  const limitText = lookupCellAfterLabel(sectionHtml(input.html, "申购与赎回金额"), "日累计申购限额");
  const base = {
    fundCode: input.fund.code,
    channelScope,
    source: SOURCE,
    dataDate: input.dataDate,
    syncRunId: input.syncRunId
  };

  return {
    limit: {
      ...base,
      shareClass: input.fund.shareClass,
      status: parsePurchaseStatus(statusText),
      limitAmountYuan: parseMoneyYuan(limitText),
      limitUnit: limitText ? "per_day" : "unknown",
      confidence: 0.9
    },
    fees: [
      ...parseOperationFees(sectionHtml(input.html, "运作费用"), base),
      ...parseSubscriptionFees(sectionHtml(input.html, "申购费率"), base),
      ...parseRedemptionFees(sectionHtml(input.html, "赎回费率"), base)
    ]
  };
}

export function createEastMoneyF10OffExchangeProvider(funds: Fund[], options: ProviderOptions = {}): DataProvider<OffExchangeFeeLimitSnapshot> {
  return {
    name: SOURCE,
    fetch: async () => {
      const fetchImpl = options.fetchImpl ?? fetch;
      const dataDate = options.dataDate ?? new Date().toISOString().slice(0, 10);
      const syncRunId = options.syncRunId ?? `eastmoney-f10-${dataDate}`;
      const limits: PurchaseLimit[] = [];
      const fees: FeeTier[] = [];

      try {
        for (const fund of funds.filter((item) => item.enabled && item.venue === "off_exchange")) {
          const url = `https://fundf10.eastmoney.com/jjfl_${fund.code}.html`;
          try {
            const response = await fetchImpl(url, {
              headers: {
                "User-Agent": "Mozilla/5.0 ETFLimit/0.1",
                Referer: "https://fund.eastmoney.com/"
              }
            });
            if (!response.ok) continue;

            const parsed = parseEastMoneyF10FeesAndLimits({ fund, html: await response.text(), dataDate, syncRunId });
            limits.push(parsed.limit);
            fees.push(...parsed.fees);
          } catch {
            continue;
          }
        }

        if (limits.length === 0) return { ok: false, errorCategory: "missing_fields", message: "No enabled off-exchange funds to fetch" };
        return { ok: true, data: { limits, fees }, source: SOURCE, dataDate, confidence: 0.9 };
      } catch (error) {
        return { ok: false, errorCategory: "network", message: error instanceof Error ? error.message : "Unknown F10 fetch error" };
      }
    }
  };
}

function parseOperationFees(html: string, base: Omit<FeeTier, "feeType" | "rate">): FeeTier[] {
  return [
    ["管理费率", "management"],
    ["托管费率", "custodian"],
    ["销售服务费率", "sales_service"]
  ].flatMap(([label, feeType]) => {
    const rate = parseLastPercent(lookupCellAfterLabel(html, label));
    return rate == null ? [] : [{ ...base, feeType: feeType as FeeTier["feeType"], rate }];
  });
}

function parseSubscriptionFees(html: string, base: Omit<FeeTier, "feeType" | "rate">): FeeTier[] {
  return extractRows(html).flatMap((cells) => {
    const [amountText, rateText] = cells;
    const rate = parseLastPercent(rateText);
    if (rate == null) return [];
    const bounds = parseAmountBounds(amountText);
    return [{ ...base, feeType: "subscription", rate, amountTierLowerBound: bounds.lower, amountTierUpperBound: bounds.upper }];
  });
}

function parseRedemptionFees(html: string, base: Omit<FeeTier, "feeType" | "rate">): FeeTier[] {
  return extractRows(html).flatMap((cells) => {
    const [durationText, rateText] = cells;
    const rate = parseLastPercent(rateText);
    if (rate == null) return [];
    const bounds = parseHoldingDayBounds(durationText);
    return [{ ...base, feeType: "redemption", rate, minHoldingDays: bounds.lower, maxHoldingDays: bounds.upper }];
  });
}

function sectionHtml(html: string, title: string): string {
  const match = html.match(new RegExp(`<h4[^>]*>[\\s\\S]*?${escapeRegExp(title)}[\\s\\S]*?</h4>([\\s\\S]*?)(?=<h4|$)`, "i"));
  return match?.[1] ?? "";
}

function lookupCellAfterLabel(html: string, label: string): string {
  const cells = extractCells(html);
  const index = cells.findIndex((cell) => cell.includes(label));
  return index >= 0 ? cells[index + 1] ?? "" : "";
}

function extractRows(html: string): string[][] {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => extractCells(row[1])).filter((cells) => cells.length >= 2);
}

function extractCells(html: string): string[] {
  return [...html.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => normalizeText(cell[1]));
}

function normalizeText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePurchaseStatus(text: string): PurchaseStatus {
  if (text.includes("暂停")) return "suspended";
  if (text.includes("限")) return "limited";
  if (text.includes("开放")) return "open";
  return "unknown";
}

function parseMoneyYuan(text: string): number | undefined {
  if (!text || text.includes("无限")) return undefined;
  const match = text.match(/([\d.]+)\s*(亿|万)?元/);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;
  if (match[2] === "亿") return value * 100000000;
  if (match[2] === "万") return value * 10000;
  return value;
}

function parseLastPercent(text: string): number | undefined {
  const matches = [...text.matchAll(/([\d.]+)%/g)];
  const last = matches.at(-1);
  if (!last) return undefined;
  return Number(last[1]) / 100;
}

function parseAmountBounds(text: string): { lower: number; upper?: number } {
  const lessThan = text.match(/小于([\d.]+)(亿|万)?元/);
  const lower = text.match(/大于等于([\d.]+)(亿|万)?元/);
  return {
    lower: lower ? amountToYuan(lower[1], lower[2]) : 0,
    upper: lessThan ? amountToYuan(lessThan[1], lessThan[2]) : undefined
  };
}

function amountToYuan(valueText: string, unit?: string): number {
  const value = Number(valueText);
  if (unit === "亿") return value * 100000000;
  if (unit === "万") return value * 10000;
  return value;
}

function parseHoldingDayBounds(text: string): { lower: number; upper?: number } {
  const lessThan = text.match(/小于([\d.]+)(天|月|年)/);
  const lower = text.match(/大于等于([\d.]+)(天|月|年)/);
  return {
    lower: lower ? durationToDays(lower[1], lower[2]) : 0,
    upper: lessThan ? durationToDays(lessThan[1], lessThan[2]) - 1 : undefined
  };
}

function durationToDays(valueText: string, unit: string): number {
  const value = Number(valueText);
  if (unit === "年") return value * 365;
  if (unit === "月") return value * 30;
  return value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
