interface ClosingPremiumInput {
  closePrice: number;
  unitNav: number;
  tradeDate: string;
  navDate: string;
}

export function calculateClosingPremiumDiscount(input: ClosingPremiumInput): number | null {
  if (!input.navDate || input.navDate > input.tradeDate) return null;
  if (!Number.isFinite(input.closePrice) || !Number.isFinite(input.unitNav) || input.unitNav <= 0) return null;
  return (input.closePrice - input.unitNav) / input.unitNav;
}
