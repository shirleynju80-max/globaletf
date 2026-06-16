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

/**
 * Premium/discount of a traded price against the real-time estimated reference NAV (IOPV).
 *
 * For cross-border QDII funds the officially disclosed unit NAV lags 1-2 days, so the
 * disclosed-NAV premium is misleading. The IOPV (实时估值) reflects the latest overseas
 * close and is the correct benchmark for the price premium/discount that drives
 * purchase-limit-squeezed funds.
 */
export function calculateIopvPremiumDiscount(price: number | null | undefined, iopv: number | null | undefined): number | null {
  if (price == null || iopv == null) return null;
  if (!Number.isFinite(price) || !Number.isFinite(iopv) || iopv <= 0) return null;
  return (price - iopv) / iopv;
}
