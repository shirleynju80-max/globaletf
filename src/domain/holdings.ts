const STOCK_ALIASES: Record<string, string[]> = {
  NVDA: ["NVDA", "NVIDIA", "NVIDIA CORP", "英伟达"],
  AAPL: ["AAPL", "APPLE", "APPLE INC", "苹果"],
  MSFT: ["MSFT", "MICROSOFT", "MICROSOFT CORP", "微软"],
  TSLA: ["TSLA", "TESLA", "TESLA INC", "特斯拉"],
  META: ["META", "META PLATFORMS", "FACEBOOK", "脸书"]
};

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
