# ETF Limit

Local web tool for comparing mainland China funds that provide exposure to overseas indices and popular overseas stocks.

## Commands

- `npm install`: install dependencies.
- `npm run sync:daily`: write the latest available validated snapshots.
- `npm run acceptance`: check whether the local snapshot passes the first MVP acceptance gate.
- `npm run api`: start the local API at `http://127.0.0.1:8787`.
- `npm run dev`: start the Vite UI at `http://127.0.0.1:5173`.
- `npm test`: run unit and UI tests.

## Data Freshness

On-exchange ETF/LOF premium or discount data uses the previous trading day's closing premium or discount and is for reference only. The first release does not calculate intraday estimated NAV or real-time premium/discount.

Off-exchange purchase limits are modeled by share class. A and C classes usually share agency-channel limits; F classes usually represent direct-sale or special-channel products and may have higher limits.
