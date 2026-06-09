# ETF Limit Local Web Tool Design

Date: 2026-06-09

## Goal

Build a local web tool for comparing mainland China funds that provide exposure to overseas indices and popular overseas stocks. The tool helps answer two questions:

1. For a target index such as Nasdaq 100, which on-exchange and off-exchange funds track it, what are their purchase limits, and what were the previous trading day's on-exchange closing premiums or discounts?
2. For a popular overseas stock such as NVDA or AAPL, which mainland funds have the highest holding concentration in that stock?

The tool presents data for comparison only. It does not provide trading advice.
For index targets, the comparison must treat different product structures as first-class data: on-exchange ETF or LOF products, off-exchange feeder funds, and share classes such as A, C, and F may all track the same target but have different liquidity, premium or discount, purchase limits, and fee costs.

## First Release Scope

The first release is a standalone local web app.

Included:

- Overseas index targets: Nasdaq 100, S&P 500, Nikkei 225, Hang Seng TECH.
- Popular overseas stocks: NVDA, AAPL, MSFT, TSLA, META.
- Extensible target configuration so more indices or stocks can be added later.
- On-exchange fund comparison with previous trading day's close price, closing premium or discount, turnover, trading cost context when available, data date, and data source.
- Off-exchange fund comparison with product share class, purchase status, per-day or per-order purchase limit, subscription fee, redemption fee, management fee, custodian fee, sales service fee when applicable, channel note when known, data date, and data source.
- Fund holding concentration ranking for the preset popular stocks.
- Daily scheduled data synchronization.
- Multi-source fallback. If the primary provider fails or returns incomplete data, the sync layer tries another provider.
- Stale data fallback. If all providers fail for a data type, the app continues to show the latest successful snapshot and displays the failed sync reason.

Excluded from the first release:

- Real-time trading recommendations.
- Brokerage account integration.
- Full coverage of all domestic funds.
- Intraday scheduled refresh beyond one daily sync run.
- Intraday premium or discount calculation and real-time estimated NAV calculation.
- Guaranteed purchase limit accuracy across every sales channel. The app records source and channel because some fund companies apply channel-specific restrictions.

## Architecture

The app has three layers:

- Web UI: a Vite, React, and TypeScript single-page app.
- Local API and query layer: a small Node.js service or serverless-style local handler that reads normalized data from SQLite and exposes query endpoints.
- Sync layer: TypeScript CLI jobs that fetch public data, validate it, normalize it, and write snapshots to SQLite.

The web UI does not fetch public financial sites directly. It reads the latest local snapshots. This keeps the page fast and makes failed provider fallback deterministic.

## Data Sources

Candidate sources:

- East Money and exchange-backed sources should be preferred for on-exchange ETF or LOF quote, premium or discount, turnover, and trading data.
- Tiantian Fund should be the preferred source for off-exchange fund detail pages, subscription status, purchase limit text, share class information, and fee schedules when the fields are available.
- AkShare interfaces backed by East Money, especially ETF quote data such as `fund_etf_spot_em`, which exposes ETF quote and premium or discount fields in public documentation. The first release uses this class of source for completed trading day snapshots rather than intraday calculation.
- AkShare/East Money fund holding interfaces such as `fund_portfolio_hold_em`, which return stock holdings, NAV percentage, market value, and reporting period.
- East Money public fund pages or APIs as fallback sources for off-exchange fund details, subscription status, purchase limit text, fee schedules, and holdings.
- Exchange ETF files or public exchange data where useful for ETF creation/redemption metadata.

Each source must pass field-level validation before its data can update a successful snapshot.

## Provider Design

Each data provider implements a shared interface:

- Fetch ETF quotes and premium or discount data.
- Fetch fund basic details.
- Fetch off-exchange purchase status and purchase limit data.
- Fetch fund fee schedules, including purchase, redemption, management, custodian, and sales service fees.
- Fetch fund portfolio holdings.

The provider chain works by data type:

1. Try providers in configured priority order.
2. Reject a provider result if required fields are missing, malformed, stale, or internally inconsistent.
3. Use the first valid provider result.
4. Store provider result metadata, including source name, fetched time, data date, confidence, raw payload hash, and error details.
5. If all providers fail, preserve the latest successful snapshot and record the failed sync status.

Provider fallback is transparent to the UI except for source and status labels.

## Data Quality Rules

Required validation:

- Premium or discount rows must include fund code, previous trading day, close price, closing premium or discount value, and turnover when available.
- Purchase limit rows must include fund code, subscription status, source, and data date. If the source confirms a limit state but no amount can be parsed, the amount is stored as unknown rather than guessed.
- Fee rows must include fund code, fee type, source, and data date. Tiered subscription and redemption fees are stored as structured tiers instead of collapsed into one number.
- Holding rows must include fund code, stock code or stock name, NAV percentage, and report period.
- Numeric fields must be parsed into stable units. Purchase limits are stored in yuan.
- Conflicting provider results are not silently merged. The selected source is shown, and provider conflict metadata is available in sync status.

Staleness rules:

- Quote and premium or discount data should come from the previous trading day's close or the latest completed trading day available. The UI labels this as historical reference data, not current intraday premium or discount.
- Purchase limit data should come from the current daily sync.
- Fund holdings are expected to lag because they come from fund reports. The UI must show the report period prominently.

Fee display rules:

- Store all parsed fee tiers for later analysis.
- For subscription fees, the default displayed and sortable rate is the lowest purchase amount tier.
- For redemption fees, the displayed summary is based on holding-day tiers, not purchase amount. The UI should show representative holding period buckets when available, such as short holding, medium holding, and long holding.
- Total visible cost is only calculated when the holding period assumption is explicit. Without a holding period, the UI compares fee components instead of presenting one precise cost number.

## Storage Model

SQLite tables:

- `targets`: target index and stock dictionary. Fields include code, name, type, aliases, region, and display order.
- `funds`: normalized fund master data. Fields include fund code, name, fund type, exchange status, fund company, tracking target, share class, parent fund code when known, and enabled flag.
- `fund_target_links`: many-to-many mapping between funds and target indices or stocks when needed.
- `fund_quotes`: on-exchange quote snapshots. Fields include fund code, close price, closing premium discount rate, turnover, trade date, source, and sync run id.
- `purchase_limits`: off-exchange purchase limit snapshots. Fields include fund code, status, limit amount yuan, limit unit, channel, source, data date, confidence, and sync run id.
- `fund_fees`: fee snapshots. Fields include fund code, fee type, rate, min holding days, max holding days, amount tier lower bound, amount tier upper bound, channel, source, data date, and sync run id.
- `fund_holdings`: holding snapshots. Fields include fund code, stock code, stock name, NAV percentage, holding market value, report period, source, and sync run id.
- `sync_runs`: one row per sync execution with started time, finished time, status, and summary.
- `provider_results`: per-provider status for each sync run and data type, including success, failure reason, data date, and payload hash.

The query layer reads the latest successful snapshot per data type. It also exposes the latest failed provider status so the UI can show stale data warnings.

## Sync Job

The project provides:

- `npm run sync:daily`: run all daily sync tasks.
- `npm run sync:quotes`: refresh previous trading day's on-exchange close quotes and closing premium or discount data.
- `npm run sync:limits`: refresh purchase status and purchase limits.
- `npm run sync:fees`: refresh fee schedules.
- `npm run sync:holdings`: refresh fund holding concentration data.

The daily job can be installed through launchd or cron. The app should document both options, but the code only needs to provide the runnable command.

Sync behavior:

- Run data types independently so one failure does not block other successful updates.
- Preserve the previous successful snapshot if a sync fails.
- Record failed provider attempts.
- Make repeated runs idempotent for the same data date and source.

Robust fetching behavior:

- Prefer public APIs and structured responses over HTML parsing.
- Use low-frequency daily requests with per-provider rate limits.
- Apply bounded retries with backoff for transient network or HTTP failures.
- Treat anti-scraping blocks, unexpected redirects, CAPTCHA-like pages, and abnormal response bodies as provider failures, then try the next provider or keep the latest successful snapshot.
- Keep provider adapters isolated so selector, endpoint, or parsing changes can be fixed without changing the query layer or UI.
- Store enough provider diagnostics, including response hash and parse failure category, to make source changes visible in tests and sync logs.

## Web UI

The first release is a single-page app with two modes.

### Index Fund Comparison

Input:

- Select or search target index.

Output:

- On-exchange funds table: code, name, tracking target, previous close price, closing premium or discount rate, turnover, estimated trading cost context when available, trade date, source, and status.
- Off-exchange funds table: code, name, share class such as A, C, or F, subscription status, purchase limit amount, limit unit, subscription fee, redemption fee summary, management fee, custodian fee, sales service fee, channel note, data date, source, and status.

Default ranking:

1. Purchasable funds first.
2. Higher known purchase limit first for off-exchange funds.
3. Lower total visible cost for the intended holding style when enough fee data is available.
4. Lower premium or larger discount first for on-exchange funds.
5. Higher turnover as a liquidity tie-breaker.

The UI should group funds by target first, then product structure:

- On-exchange ETF or LOF products.
- Off-exchange feeder or index fund share classes.
- Related A, C, F, and other share classes under the same parent fund when the relationship is known.

The on-exchange premium or discount column must be labeled as previous trading day's closing premium or discount and must include a note that it is for reference only. The first release does not calculate intraday estimated NAV or current intraday premium or discount.

### Stock Holding Concentration

Input:

- Select preset stock: NVDA, AAPL, MSFT, TSLA, META.

Output:

- Ranking table: fund code, fund name, stock NAV percentage, holding market value, report period, fund type, subscription status, purchase limit amount, source, and status.

Filters:

- Only purchasable funds.
- Only on-exchange funds.
- Only off-exchange funds.
- Only QDII or ETF feeder-style funds when fund type is known.

The UI must clearly mark that holdings are report-period data, not real-time holdings.

### Data Status

A visible status area shows:

- Last successful sync time by data type.
- Current sync status.
- Provider used for each data type.
- Failed provider reason when the latest daily sync failed.
- Stale snapshot date when the UI is showing older successful data.
- Separate freshness status for quote, purchase limit, fee, and holding data.

## Error Handling

Provider errors are classified as:

- Network failure.
- HTTP or API failure.
- Anti-scraping or access block.
- Parse failure.
- Missing required fields.
- Stale data.
- Conflicting provider data.

The UI behavior is:

- If a latest successful snapshot exists, show it and display a stale data warning.
- If no successful snapshot exists for a query, show an empty state with the failed sync reason.
- Never show unvalidated provider data as normal data.

## Testing Strategy

Provider tests:

- Use recorded HTML or JSON samples.
- Verify parsing of ETF previous close quote and closing premium or discount data.
- Verify parsing of purchase limit text and unknown amount handling.
- Verify parsing of share classes and fee schedules, including tiered subscription and redemption fees.
- Verify the default subscription fee display uses the lowest purchase amount tier.
- Verify redemption fee display uses holding-day tiers.
- Verify parsing of fund holdings and report periods.

Fallback tests:

- Simulate primary provider failure and verify secondary provider selection.
- Simulate all providers failing and verify latest successful snapshot remains queryable.
- Simulate provider conflicts and verify the selected source and conflict metadata are recorded.

UI tests:

- Verify index mode renders on-exchange and off-exchange tables.
- Verify same-target products are grouped across on-exchange products and off-exchange A, C, F, or other share classes.
- Verify stock mode renders concentration rankings.
- Verify stale data warning and provider source labels.
- Verify empty states when no snapshot exists.

Sync tests:

- Verify idempotent repeated sync runs.
- Verify partial failure does not erase successful data from another data type.
- Verify failed sync runs are recorded in `sync_runs` and `provider_results`.
- Verify anti-scraping-like responses are treated as provider failures and do not overwrite valid snapshots.

## Implementation Notes

The project starts from an empty directory. The first implementation plan should create:

- `package.json`
- TypeScript config
- Vite React app
- SQLite schema and migration script
- Provider interface and provider chain
- Initial AkShare/East Money provider implementations or adapters
- Initial Tiantian Fund provider implementation for fund details, purchase limits, and fee schedules
- Sync CLI commands
- Query API
- First UI page
- Test fixtures for provider parsing and fallback behavior

## Open Assumptions

- The user wants local-only operation for the first release.
- The user accepts that purchase limit data can vary by sales channel and must show source/channel labels.
- Tiantian Fund should be tried first for off-exchange fund-level data, but it still needs fallback because page structure, channel-specific limits, and fee text can change.
- East Money or exchange-backed sources should be tried first for on-exchange ETF and LOF quote, premium or discount, and turnover data.
- On-exchange premium or discount comparison uses the previous trading day's closing data to reduce complexity and avoid unreliable intraday estimated NAV calculations.
- The first release can use a finite, configurable target universe rather than attempting full market discovery.
- Holding concentration for popular stocks is based on published fund reports, so it is naturally delayed.
