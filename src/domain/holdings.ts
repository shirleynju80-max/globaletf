const STOCK_ALIASES: Record<string, string[]> = {
  NVDA: ["NVDA", "NVIDIA", "NVIDIA CORP", "英伟达"],
  AAPL: ["AAPL", "APPLE", "APPLE INC", "苹果"],
  GOOG: ["GOOG", "GOOGL", "GOOGLE", "ALPHABET", "谷歌"],
  MU: ["MU", "MICRON", "MICRON TECHNOLOGY", "美光"],
  AVGO: ["AVGO", "BROADCOM", "博通"],
  AMD: ["AMD", "ADVANCED MICRO DEVICES", "超威"],
  TSM: ["TSM", "TSMC", "TAIWAN SEMICONDUCTOR", "台积电", "台湾积体电路"],
  HYNIX: ["HYNIX", "SK HYNIX", "SK海力士", "海力士"]
};

export function stockTargetLookupKeys(targetCode: string): string[] {
  const key = targetCode.trim().toUpperCase();
  const aliases = STOCK_ALIASES[key] ?? [key];
  return [...new Set([key, ...aliases])];
}

export function matchesStockTarget(input: { targetCode: string; stockCode?: string; stockName?: string }): boolean {
  const aliases = STOCK_ALIASES[input.targetCode.toUpperCase()] ?? [input.targetCode.toUpperCase()];
  const normalizedCode = normalize(input.stockCode ?? "");
  const normalizedName = normalize(input.stockName ?? "");

  return aliases.some((alias) => {
    const normalizedAlias = normalize(alias);
    return normalizedCode === normalizedAlias || normalizedName.includes(normalizedAlias);
  });
}

function normalize(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}
