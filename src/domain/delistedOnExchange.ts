/** On-exchange codes with no secondary-market quote feed (delisted / no trading). */
export const DELISTED_ON_EXCHANGE_CODES = ["160213"] as const;

const DELISTED_ON_EXCHANGE = new Set<string>(DELISTED_ON_EXCHANGE_CODES);

export function isDelistedOnExchange(code: string): boolean {
  return DELISTED_ON_EXCHANGE.has(code);
}

export function isActiveOnExchangeFund(code: string, venue: string): boolean {
  return venue === "on_exchange" && !isDelistedOnExchange(code);
}
