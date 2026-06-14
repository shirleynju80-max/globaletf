# ETF Coverage And Premium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve ETF/fund coverage and make previous-close premium usable for cross-border ETFs whose official NAV lags the trade date.

**Architecture:** Keep the current SQLite snapshot model and provider chain. Add NAV reference metadata to quote rows, add East Money suggestion search as an additional fund-discovery source, and add a separate stock-concentration scan universe that can include non-index QDII funds such as `539002`.

**Tech Stack:** TypeScript, Vitest, better-sqlite3, Express, React.

---

### Task 1: Previous-Close Premium With Latest Disclosed NAV

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/quotes.ts`
- Modify: `src/domain/quotes.test.ts`
- Modify: `src/providers/eastmoneyOnExchangeQuotes.ts`
- Modify: `src/providers/eastmoneyOnExchangeQuotes.test.ts`
- Modify: `src/db/schema.ts`
- Modify: `src/db/repositories.ts`
- Modify: `src/ui/IndexComparison.tsx`
- Modify: `src/ui/IndexComparison.test.tsx`

- [ ] Write a failing test that expects `calculateClosingPremiumDiscount` to calculate when NAV is older than the trade date and reject future NAV dates.
- [ ] Add optional `unitNav` and `navDate` to `FundQuote`.
- [ ] Add `unit_nav` and `nav_date` columns to `fund_quotes`, including migration for existing databases.
- [ ] Store latest disclosed NAV metadata in quote snapshots.
- [ ] Show premium as "按 YYYY-MM-DD 净值" in the UI when NAV date differs from trade date.
- [ ] Run focused quote, repository, and UI tests.

### Task 2: Product Discovery Coverage For Nasdaq 100

**Files:**
- Modify: `src/providers/eastmoneyFundSearch.ts`
- Modify: `src/providers/eastmoneyFundSearch.test.ts`
- Modify: `src/sync/syncRunner.ts`
- Modify: `src/acceptance/acceptance.ts`
- Modify: `src/acceptance/acceptance.test.ts`

- [ ] Add parser and selector support for East Money `FundSearchAPI.ashx`.
- [ ] Query all configured target names, aliases, and seed fund codes.
- [ ] Deduplicate products by fund code across `fundcode_search.js` and suggestion results.
- [ ] Add `159632` as a Nasdaq 100 seed product and verify it is classified as on-exchange ETF.
- [ ] Add acceptance coverage requiring `159632` in Nasdaq 100 on-exchange results.

### Task 3: Stock Concentration Scan Universe

**Files:**
- Create: `src/domain/stockScanUniverse.ts`
- Create: `src/domain/stockScanUniverse.test.ts`
- Modify: `src/sync/syncRunner.ts`
- Modify: `src/acceptance/acceptance.ts`
- Modify: `src/acceptance/acceptance.test.ts`

- [ ] Add a curated stock concentration scan universe with `539002` as an enabled off-exchange QDII fund.
- [ ] Merge scan-universe funds into daily fund snapshots without assigning an index target.
- [ ] Ensure holdings sync fetches scan-universe holdings and stock concentration can rank them.
- [ ] Add acceptance coverage requiring `539002` in the persisted stock scan universe and in NVDA concentration when holdings are available.

### Task 4: Verification

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run acceptance`.
- [ ] Run `npm run sync:daily`.
- [ ] Verify `/api/index-comparison/NASDAQ_100` includes `159632` and previous-close premium metadata.
- [ ] Verify `/api/stock-concentration/NVDA` can include non-index scan funds such as `539002` when its F10 holdings disclose NVDA.
