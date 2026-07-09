import type { LimitCurrency, PurchaseStatus } from "./types";

export function parsePurchaseStatus(text: string): PurchaseStatus {
  if (text.includes("暂停")) return "suspended";
  if (text.includes("限")) return "limited";
  if (text.includes("开放")) return "open";
  return "unknown";
}

/** Skip company-page rows that only carry an unparseable status with no limit amount. */
export function shouldPersistCompanyPageLimit(statusText: string, limitText: string): boolean {
  if (!statusText && !limitText) return false;
  if (parsePurchaseStatus(statusText) !== "unknown") return true;
  return parseMoneyLimit(limitText) != null;
}

export function parseMoneyYuan(text: string): number | undefined {
  const parsed = parseMoneyLimit(text);
  return parsed?.currency === "CNY" ? parsed.amount : undefined;
}

export interface ParsedMoneyLimit {
  amount: number;
  currency: LimitCurrency;
}

export function parseMoneyLimit(text: string): ParsedMoneyLimit | undefined {
  if (!text || text.includes("无限")) return undefined;
  const usdMatch = text.match(/([\d.]+)\s*(美元|美金|USD)/i);
  if (usdMatch) {
    const value = Number(usdMatch[1]);
    if (!Number.isFinite(value)) return undefined;
    return { amount: value, currency: "USD" };
  }

  const match = text.match(/([\d.]+)\s*(亿|万)?\s*(元|人民币)/);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;
  if (match[2] === "亿") return { amount: value * 100000000, currency: "CNY" };
  if (match[2] === "万") return { amount: value * 10000, currency: "CNY" };
  return { amount: value, currency: "CNY" };
}

export interface ParsedDirectLimitNotice {
  status: PurchaseStatus;
  limitAmount?: number;
  limitCurrency?: LimitCurrency;
  limitAmountYuan?: number;
  limitUnit: "per_day" | "unknown";
  confidence: number;
  excerpt: string;
}

function parsedLimitAmount(amount: ParsedMoneyLimit | undefined): Pick<ParsedDirectLimitNotice, "limitAmount" | "limitCurrency" | "limitAmountYuan"> {
  if (!amount) return {};
  return {
    limitAmount: amount.amount,
    limitCurrency: amount.currency,
    limitAmountYuan: amount.currency === "CNY" ? amount.amount : undefined
  };
}

/**
 * Parse fund-company announcement text for direct-channel purchase limits.
 * Handles common QDII limit notice wording (per share class, 直销渠道 vs 代销).
 */
export function parseDirectLimitFromAnnouncement(
  text: string,
  shareClass: string,
  fundCode?: string
): ParsedDirectLimitNotice | null {
  const normalized = text.replace(/\s+/g, "");
  if (
    !/(申购|定投|转换转入).*(限额|限制|大额)/.test(normalized)
    && !/类基金份额限额/.test(normalized)
    && !/不得超过\d/.test(normalized)
    && !/暂停.*申购/.test(normalized)
  ) {
    return null;
  }

  if (/暂停.*申购|申购.*暂停/.test(normalized)) {
    const hasExplicitLimit = new RegExp(`${shareClass}\\s*类基金份额限额\\d`).test(normalized)
      || /金额限制/.test(normalized);
    if (!hasExplicitLimit) {
      return { status: "suspended", limitUnit: "unknown", confidence: 0.85, excerpt: "暂停申购" };
    }
  }

  const classPatterns: Array<{ pattern: RegExp; confidence: number }> = [
    { pattern: new RegExp(`${shareClass}\\s*类基金份额限额(\\d+(?:\\.\\d+)?(?:亿|万)?(?:元|人民币|美元|美金|USD))`, "i"), confidence: 0.95 },
    { pattern: new RegExp(`${shareClass}类基金份额限额(\\d+(?:\\.\\d+)?(?:亿|万)?(?:元|人民币|美元|美金|USD))`, "i"), confidence: 0.95 },
    { pattern: new RegExp(`（QDII）${shareClass}[^。]{0,60}?不得超过(\\d+(?:\\.\\d+)?(?:亿|万)?(?:元|人民币|美元|美金|USD))`, "i"), confidence: 0.9 },
    { pattern: new RegExp(`${shareClass}\\s*类[^。]{0,40}?限额(\\d+(?:\\.\\d+)?(?:亿|万)?(?:元|人民币|美元|美金|USD))`, "i"), confidence: 0.9 },
    { pattern: new RegExp(`下属${shareClass}类[^。]{0,60}?限额(\\d+(?:\\.\\d+)?(?:亿|万)?(?:元|人民币|美元|美金|USD))`, "i"), confidence: 0.9 }
  ];

  for (const { pattern, confidence } of classPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      const amount = parseMoneyLimit(match[1]);
      return {
        status: "limited",
        ...parsedLimitAmount(amount),
        limitUnit: "per_day",
        confidence,
        excerpt: match[0]
      };
    }
  }

  if (fundCode) {
    const segment = normalized.match(new RegExp(`${fundCode}[\\s\\S]{0,160}`))?.[0];
    const amounts = segment ? [...segment.matchAll(/(\d+(?:\.\d+)?(?:亿|万)?(?:元|人民币|美元|美金|USD))/gi)]
      .map((match) => parseMoneyLimit(match[1]))
      .filter((value): value is ParsedMoneyLimit => value != null && value.amount > 0) : [];
    const amount = amounts.at(-1);
    if (amount) {
      return {
        status: "limited",
        ...parsedLimitAmount(amount),
        limitUnit: "per_day",
        confidence: 0.9,
        excerpt: `${fundCode}…${amount.amount}${amount.currency === "USD" ? "美元" : "元"}`
      };
    }
  }

  const directPatterns = [
    /本公司直销渠道[^。]{0,80}?限额(\d+(?:\.\d+)?(?:亿|万)?(?:元|人民币|美元|美金|USD))/i,
    /直销渠道个人投资者[^。]{0,80}?限额(\d+(?:\.\d+)?(?:亿|万)?(?:元|人民币|美元|美金|USD))/i,
    /通过本公司直销渠道[^。]{0,80}?限额(\d+(?:\.\d+)?(?:亿|万)?(?:元|人民币|美元|美金|USD))/i,
    /直销渠道[^。]{0,40}?限额(\d+(?:\.\d+)?(?:亿|万)?(?:元|人民币|美元|美金|USD))/i
  ];
  for (const pattern of directPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      const amount = parseMoneyLimit(match[1]);
      return {
        status: "limited",
        ...parsedLimitAmount(amount),
        limitUnit: "per_day",
        confidence: 0.8,
        excerpt: match[0]
      };
    }
  }

  const amountPatterns = [
    /限制申购金额[^0-9]{0,30}(\d+(?:\.\d+)?(?:亿|万)?(?:元|人民币|美元|美金|USD)?)/i,
    /限制定期定额投资金额[^0-9]{0,30}(\d+(?:\.\d+)?(?:亿|万)?(?:元|人民币|美元|美金|USD)?)/i,
    /单日累计申购限额[^0-9]{0,30}(\d+(?:\.\d+)?(?:亿|万)?(?:元|人民币|美元|美金|USD))/i
  ];
  for (const pattern of amountPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      const amount = parseMoneyLimit(match[1]) ?? { amount: Number(match[1]), currency: "CNY" as const };
      if (Number.isFinite(amount.amount) && amount.amount > 0) {
        return {
          status: "limited",
          ...parsedLimitAmount(amount),
          limitUnit: "per_day",
          confidence: 0.88,
          excerpt: match[0]
        };
      }
    }
  }

  if (/限大额|限制大额|大额申购/.test(normalized)) {
    return { status: "limited", limitUnit: "unknown", confidence: 0.7, excerpt: "限大额" };
  }

  if (/开放申购/.test(normalized)) {
    return { status: "open", limitUnit: "unknown", confidence: 0.75, excerpt: "开放申购" };
  }

  return null;
}
