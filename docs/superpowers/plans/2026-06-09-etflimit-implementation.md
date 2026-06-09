# ETF Limit Local Web Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone local web tool that compares overseas-index funds by purchase limits, fee costs, previous-close premiums/discounts, and popular-stock holding concentration.

**Architecture:** Use a Vite React UI backed by a small TypeScript local API and sync layer. Store normalized snapshots in SQLite, isolate public-data adapters behind provider interfaces, and keep the UI reading validated local snapshots only.

**Tech Stack:** Node.js, TypeScript, Vite, React, Vitest, Testing Library, Express, better-sqlite3, Zod, tsx.

---

## File Structure

- `package.json`: scripts and dependencies for app, tests, sync commands, and local API.
- `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`: TypeScript, Vite, and Vitest setup.
- `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`: React app shell and UI.
- `src/domain/types.ts`: shared domain types for targets, funds, quotes, limits, fees, holdings, sync metadata, and provider results.
- `src/domain/targets.ts`: initial target universe for Nasdaq 100, S&P 500, Nikkei 225, Hang Seng TECH, NVDA, AAPL, MSFT, TSLA, META.
- `src/domain/fees.ts`: fee-tier display and cost helpers.
- `src/domain/quotes.ts`: previous-close premium/discount calculation and date matching rules.
- `src/domain/holdings.ts`: overseas stock alias matching for disclosed fund holdings.
- `src/domain/purchaseLimits.ts`: share-class and channel-scope logic for A/C/F purchase limits.
- `src/providers/types.ts`: provider contracts, validation result types, and provider error categories.
- `src/providers/providerChain.ts`: fallback orchestration across providers.
- `src/providers/sourceCatalog.ts`: first-release data-source priorities, endpoint patterns, and parser expectations.
- `src/providers/fixtures/*.json`: recorded sample data used by tests and mock providers.
- `src/providers/mockProviders.ts`: deterministic mock providers for first UI/API integration and fallback tests.
- `src/db/schema.ts`: SQLite schema creation.
- `src/db/database.ts`: connection and migration helper.
- `src/db/repositories.ts`: write/read operations for normalized snapshots.
- `src/sync/syncRunner.ts`: sync orchestration for quotes, limits, fees, and holdings.
- `src/sync/cli.ts`: command entrypoint for `sync:daily`, `sync:quotes`, `sync:limits`, `sync:fees`, `sync:holdings`.
- `src/api/server.ts`: Express local API exposing targets, index comparison, stock concentration, and sync status.
- `src/api/client.ts`: browser client for local API.
- `src/ui/*.tsx`: focused UI components for mode switch, status bar, index comparison, stock concentration, and table formatting.
- `src/test/*.test.ts(x)`: unit and UI tests.

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "etflimit",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc -p tsconfig.json && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "api": "tsx src/api/server.ts",
    "sync:daily": "tsx src/sync/cli.ts daily",
    "sync:quotes": "tsx src/sync/cli.ts quotes",
    "sync:limits": "tsx src/sync/cli.ts limits",
    "sync:fees": "tsx src/sync/cli.ts fees",
    "sync:holdings": "tsx src/sync/cli.ts holdings"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "better-sqlite3": "^11.10.0",
    "express": "^5.1.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.3.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/express": "^5.0.0",
    "@types/node": "^22.15.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "jsdom": "^26.1.0",
    "tsx": "^4.19.0",
    "typescript": "^5.8.0",
    "vite": "^6.3.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 2: Create TypeScript and test config**

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

```json
// tsconfig.node.json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

```ts
// vite.config.ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173
  }
});
```

```ts
// vitest.config.ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"]
  }
});
```

- [ ] **Step 3: Create app shell**

```html
<!-- index.html -->
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ETF Limit</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```tsx
// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

```tsx
// src/App.tsx
export function App() {
  return (
    <main className="app-shell">
      <h1>ETF Limit</h1>
      <p>境外标的基金限购、费率、折溢价和持仓浓度比较工具。</p>
    </main>
  );
}
```

```css
/* src/styles.css */
:root {
  color: #172026;
  background: #f6f8fb;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

body {
  margin: 0;
}

.app-shell {
  max-width: 1280px;
  margin: 0 auto;
  padding: 32px;
}
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`

Expected: dependencies install and `package-lock.json` is created.

- [ ] **Step 5: Run initial verification**

Run: `npm test`

Expected: Vitest starts and reports no tests or passes setup after Task 2 adds `src/test/setup.ts`. If Vitest fails because `src/test/setup.ts` is missing, continue to Task 2 before committing.

- [ ] **Step 6: Commit scaffold**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts vitest.config.ts index.html src/main.tsx src/App.tsx src/styles.css
git commit -m "Initialize ETF limit web app scaffold"
```

## Task 2: Domain Types and Target Universe

**Files:**
- Create: `src/test/setup.ts`
- Create: `src/domain/types.ts`
- Create: `src/domain/targets.ts`
- Test: `src/domain/targets.test.ts`

- [ ] **Step 1: Add test setup**

```ts
// src/test/setup.ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 2: Write failing target tests**

```ts
// src/domain/targets.test.ts
import { describe, expect, it } from "vitest";
import { STOCK_TARGETS, TARGETS, findTargetByCode } from "./targets";

describe("targets", () => {
  it("contains the first release overseas index targets", () => {
    expect(TARGETS.map((target) => target.code)).toEqual(
      expect.arrayContaining(["NASDAQ_100", "SP_500", "NIKKEI_225", "HSTECH"])
    );
  });

  it("contains the first release popular stock targets", () => {
    expect(STOCK_TARGETS.map((target) => target.code)).toEqual(["NVDA", "AAPL", "MSFT", "TSLA", "META"]);
  });

  it("finds targets by code and alias", () => {
    expect(findTargetByCode("nasdaq100")?.code).toBe("NASDAQ_100");
    expect(findTargetByCode("英伟达")?.code).toBe("NVDA");
  });
});
```

- [ ] **Step 3: Run target tests to verify failure**

Run: `npm test -- src/domain/targets.test.ts`

Expected: FAIL because `src/domain/targets.ts` does not exist.

- [ ] **Step 4: Add shared types**

```ts
// src/domain/types.ts
export type TargetType = "index" | "stock";
export type ProductVenue = "on_exchange" | "off_exchange";
export type ShareClass = "A" | "C" | "F" | "ETF" | "LOF" | "UNKNOWN";
export type ChannelScope = "agency" | "direct" | "special" | "unknown";
export type PurchaseStatus = "open" | "limited" | "suspended" | "unknown";
export type FeeType = "subscription" | "redemption" | "management" | "custodian" | "sales_service";

export interface Target {
  code: string;
  name: string;
  type: TargetType;
  aliases: string[];
  region: string;
  displayOrder: number;
}

export interface Fund {
  code: string;
  name: string;
  fundType: string;
  venue: ProductVenue;
  fundCompany?: string;
  trackingTargetCode?: string;
  shareClass: ShareClass;
  parentFundCode?: string;
  enabled: boolean;
}

export interface FundQuote {
  fundCode: string;
  closePrice: number;
  closingPremiumDiscountRate: number | null;
  turnover?: number;
  tradeDate: string;
  source: string;
  syncRunId: string;
}

export interface PurchaseLimit {
  fundCode: string;
  shareClass: ShareClass;
  status: PurchaseStatus;
  limitAmountYuan?: number;
  limitUnit?: "per_day" | "per_order" | "unknown";
  channelScope: ChannelScope;
  source: string;
  dataDate: string;
  confidence: number;
  syncRunId: string;
}

export interface FeeTier {
  fundCode: string;
  feeType: FeeType;
  rate: number;
  minHoldingDays?: number;
  maxHoldingDays?: number;
  amountTierLowerBound?: number;
  amountTierUpperBound?: number;
  channelScope: ChannelScope;
  source: string;
  dataDate: string;
  syncRunId: string;
}

export interface FundHolding {
  fundCode: string;
  stockCode: string;
  stockName: string;
  navPercent: number;
  holdingMarketValue?: number;
  reportPeriod: string;
  source: string;
  syncRunId: string;
}
```

- [ ] **Step 5: Add target config**

```ts
// src/domain/targets.ts
import type { Target } from "./types";

export const INDEX_TARGETS: Target[] = [
  { code: "NASDAQ_100", name: "纳斯达克100", type: "index", aliases: ["nasdaq100", "纳指100", "纳斯达克 100"], region: "US", displayOrder: 1 },
  { code: "SP_500", name: "标普500", type: "index", aliases: ["s&p500", "sp500", "标普 500"], region: "US", displayOrder: 2 },
  { code: "NIKKEI_225", name: "日经225", type: "index", aliases: ["nikkei225", "日经 225"], region: "JP", displayOrder: 3 },
  { code: "HSTECH", name: "恒生科技", type: "index", aliases: ["hang seng tech", "恒科"], region: "HK", displayOrder: 4 }
];

export const STOCK_TARGETS: Target[] = [
  { code: "NVDA", name: "英伟达", type: "stock", aliases: ["nvidia", "英伟达"], region: "US", displayOrder: 101 },
  { code: "AAPL", name: "苹果", type: "stock", aliases: ["apple", "苹果"], region: "US", displayOrder: 102 },
  { code: "MSFT", name: "微软", type: "stock", aliases: ["microsoft", "微软"], region: "US", displayOrder: 103 },
  { code: "TSLA", name: "特斯拉", type: "stock", aliases: ["tesla", "特斯拉"], region: "US", displayOrder: 104 },
  { code: "META", name: "Meta", type: "stock", aliases: ["facebook", "meta"], region: "US", displayOrder: 105 }
];

export const TARGETS = [...INDEX_TARGETS, ...STOCK_TARGETS].sort((a, b) => a.displayOrder - b.displayOrder);

export function findTargetByCode(input: string): Target | undefined {
  const normalized = input.trim().toLowerCase().replace(/\s+/g, "");
  return TARGETS.find((target) => {
    if (target.code.toLowerCase().replace(/_/g, "") === normalized) return true;
    return target.aliases.some((alias) => alias.toLowerCase().replace(/\s+/g, "") === normalized);
  });
}
```

- [ ] **Step 6: Run tests**

Run: `npm test -- src/domain/targets.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit domain target config**

```bash
git add src/test/setup.ts src/domain/types.ts src/domain/targets.ts src/domain/targets.test.ts
git commit -m "Add ETF limit domain targets"
```

## Task 3: Fee and Purchase Limit Rules

**Files:**
- Create: `src/domain/fees.ts`
- Create: `src/domain/purchaseLimits.ts`
- Test: `src/domain/fees.test.ts`
- Test: `src/domain/purchaseLimits.test.ts`

- [ ] **Step 1: Write failing fee tests**

```ts
// src/domain/fees.test.ts
import { describe, expect, it } from "vitest";
import type { FeeTier } from "./types";
import { selectDefaultSubscriptionRate, summarizeRedemptionFees } from "./fees";

describe("fee helpers", () => {
  const tiers: FeeTier[] = [
    { fundCode: "000001", feeType: "subscription", rate: 0.0015, amountTierLowerBound: 0, amountTierUpperBound: 1000000, channelScope: "agency", source: "tiantian", dataDate: "2026-06-09", syncRunId: "run-1" },
    { fundCode: "000001", feeType: "subscription", rate: 0.001, amountTierLowerBound: 1000000, channelScope: "agency", source: "tiantian", dataDate: "2026-06-09", syncRunId: "run-1" },
    { fundCode: "000001", feeType: "redemption", rate: 0.015, minHoldingDays: 0, maxHoldingDays: 6, channelScope: "agency", source: "tiantian", dataDate: "2026-06-09", syncRunId: "run-1" },
    { fundCode: "000001", feeType: "redemption", rate: 0.005, minHoldingDays: 7, maxHoldingDays: 29, channelScope: "agency", source: "tiantian", dataDate: "2026-06-09", syncRunId: "run-1" }
  ];

  it("uses the lowest purchase amount tier for default subscription display", () => {
    expect(selectDefaultSubscriptionRate(tiers)).toBe(0.0015);
  });

  it("summarizes redemption fees by holding-day tiers", () => {
    expect(summarizeRedemptionFees(tiers)).toEqual(["0-6天: 1.50%", "7-29天: 0.50%"]);
  });
});
```

- [ ] **Step 2: Write failing purchase-limit tests**

```ts
// src/domain/purchaseLimits.test.ts
import { describe, expect, it } from "vitest";
import { defaultChannelScopeForShareClass } from "./purchaseLimits";

describe("purchase limit share-class rules", () => {
  it("defaults A and C classes to agency scope", () => {
    expect(defaultChannelScopeForShareClass("A")).toBe("agency");
    expect(defaultChannelScopeForShareClass("C")).toBe("agency");
  });

  it("defaults F class to direct scope", () => {
    expect(defaultChannelScopeForShareClass("F")).toBe("direct");
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run: `npm test -- src/domain/fees.test.ts src/domain/purchaseLimits.test.ts`

Expected: FAIL because helpers do not exist.

- [ ] **Step 4: Implement helpers**

```ts
// src/domain/fees.ts
import type { FeeTier } from "./types";

export function selectDefaultSubscriptionRate(tiers: FeeTier[]): number | undefined {
  return tiers
    .filter((tier) => tier.feeType === "subscription")
    .sort((a, b) => (a.amountTierLowerBound ?? 0) - (b.amountTierLowerBound ?? 0))[0]?.rate;
}

export function summarizeRedemptionFees(tiers: FeeTier[]): string[] {
  return tiers
    .filter((tier) => tier.feeType === "redemption")
    .sort((a, b) => (a.minHoldingDays ?? 0) - (b.minHoldingDays ?? 0))
    .map((tier) => {
      const min = tier.minHoldingDays ?? 0;
      const max = tier.maxHoldingDays == null ? "以上" : `${tier.maxHoldingDays}`;
      return `${min}-${max}天: ${formatPercent(tier.rate)}`;
    });
}

export function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}
```

```ts
// src/domain/purchaseLimits.ts
import type { ChannelScope, ShareClass } from "./types";

export function defaultChannelScopeForShareClass(shareClass: ShareClass): ChannelScope {
  if (shareClass === "F") return "direct";
  if (shareClass === "A" || shareClass === "C") return "agency";
  return "unknown";
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- src/domain/fees.test.ts src/domain/purchaseLimits.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit helper rules**

```bash
git add src/domain/fees.ts src/domain/purchaseLimits.ts src/domain/fees.test.ts src/domain/purchaseLimits.test.ts
git commit -m "Add fee and purchase limit rules"
```

## Task 4: Provider Contracts and Fallback Chain

**Files:**
- Create: `src/providers/types.ts`
- Create: `src/providers/providerChain.ts`
- Test: `src/providers/providerChain.test.ts`

- [ ] **Step 1: Write failing provider-chain tests**

```ts
// src/providers/providerChain.test.ts
import { describe, expect, it } from "vitest";
import type { DataProvider } from "./types";
import { runProviderChain } from "./providerChain";

describe("runProviderChain", () => {
  it("uses the first valid provider result", async () => {
    const providers: DataProvider<number>[] = [
      { name: "primary", fetch: async () => ({ ok: true, data: 1, source: "primary", dataDate: "2026-06-09", confidence: 0.9 }) },
      { name: "secondary", fetch: async () => ({ ok: true, data: 2, source: "secondary", dataDate: "2026-06-09", confidence: 0.8 }) }
    ];

    const result = await runProviderChain(providers);

    expect(result.data).toBe(1);
    expect(result.providerResults).toHaveLength(1);
  });

  it("falls back when primary provider fails", async () => {
    const providers: DataProvider<number>[] = [
      { name: "primary", fetch: async () => ({ ok: false, errorCategory: "anti_scraping", message: "blocked" }) },
      { name: "secondary", fetch: async () => ({ ok: true, data: 2, source: "secondary", dataDate: "2026-06-09", confidence: 0.8 }) }
    ];

    const result = await runProviderChain(providers);

    expect(result.data).toBe(2);
    expect(result.providerResults.map((entry) => entry.providerName)).toEqual(["primary", "secondary"]);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- src/providers/providerChain.test.ts`

Expected: FAIL because provider types do not exist.

- [ ] **Step 3: Implement provider types and chain**

```ts
// src/providers/types.ts
export type ProviderErrorCategory =
  | "network"
  | "http"
  | "anti_scraping"
  | "parse"
  | "missing_fields"
  | "stale_data"
  | "conflict";

export type ProviderFetchResult<T> =
  | {
      ok: true;
      data: T;
      source: string;
      dataDate: string;
      confidence: number;
      rawPayloadHash?: string;
    }
  | {
      ok: false;
      errorCategory: ProviderErrorCategory;
      message: string;
      rawPayloadHash?: string;
    };

export interface DataProvider<T> {
  name: string;
  fetch: () => Promise<ProviderFetchResult<T>>;
}

export interface ProviderAttempt {
  providerName: string;
  ok: boolean;
  errorCategory?: ProviderErrorCategory;
  message?: string;
  dataDate?: string;
  rawPayloadHash?: string;
}
```

```ts
// src/providers/providerChain.ts
import type { DataProvider, ProviderAttempt } from "./types";

export async function runProviderChain<T>(providers: DataProvider<T>[]): Promise<{ data: T; providerResults: ProviderAttempt[] }> {
  const providerResults: ProviderAttempt[] = [];

  for (const provider of providers) {
    const result = await provider.fetch();
    if (result.ok) {
      providerResults.push({
        providerName: provider.name,
        ok: true,
        dataDate: result.dataDate,
        rawPayloadHash: result.rawPayloadHash
      });
      return { data: result.data, providerResults };
    }

    providerResults.push({
      providerName: provider.name,
      ok: false,
      errorCategory: result.errorCategory,
      message: result.message,
      rawPayloadHash: result.rawPayloadHash
    });
  }

  throw Object.assign(new Error("All providers failed"), { providerResults });
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/providers/providerChain.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit provider chain**

```bash
git add src/providers/types.ts src/providers/providerChain.ts src/providers/providerChain.test.ts
git commit -m "Add provider fallback chain"
```

## Task 5: Data Source Catalog, Quote Rules, and Holding Aliases

**Files:**
- Create: `src/domain/quotes.ts`
- Create: `src/domain/holdings.ts`
- Create: `src/providers/sourceCatalog.ts`
- Test: `src/domain/quotes.test.ts`
- Test: `src/domain/holdings.test.ts`
- Test: `src/providers/sourceCatalog.test.ts`

- [ ] **Step 1: Write failing quote-rule tests**

```ts
// src/domain/quotes.test.ts
import { describe, expect, it } from "vitest";
import { calculateClosingPremiumDiscount } from "./quotes";

describe("calculateClosingPremiumDiscount", () => {
  it("calculates previous-close premium when trade date and NAV date match", () => {
    expect(calculateClosingPremiumDiscount({ closePrice: 1.23, unitNav: 1.2, tradeDate: "2026-06-08", navDate: "2026-06-08" })).toBeCloseTo(0.025);
  });

  it("does not fabricate a premium when NAV date does not match trade date", () => {
    expect(calculateClosingPremiumDiscount({ closePrice: 1.23, unitNav: 1.2, tradeDate: "2026-06-08", navDate: "2026-06-07" })).toBeNull();
  });

  it("does not calculate when NAV is zero or invalid", () => {
    expect(calculateClosingPremiumDiscount({ closePrice: 1.23, unitNav: 0, tradeDate: "2026-06-08", navDate: "2026-06-08" })).toBeNull();
  });
});
```

- [ ] **Step 2: Write failing holding-alias tests**

```ts
// src/domain/holdings.test.ts
import { describe, expect, it } from "vitest";
import { matchesStockTarget } from "./holdings";

describe("holding stock matching", () => {
  it("matches disclosed English and Chinese names for NVDA", () => {
    expect(matchesStockTarget({ targetCode: "NVDA", stockCode: "NVDA", stockName: "NVIDIA Corp" })).toBe(true);
    expect(matchesStockTarget({ targetCode: "NVDA", stockCode: "", stockName: "英伟达" })).toBe(true);
  });

  it("does not match unrelated stocks", () => {
    expect(matchesStockTarget({ targetCode: "NVDA", stockCode: "AAPL", stockName: "Apple Inc" })).toBe(false);
  });
});
```

- [ ] **Step 3: Write failing source-catalog tests**

```ts
// src/providers/sourceCatalog.test.ts
import { describe, expect, it } from "vitest";
import { HOLDING_SOURCES, OFF_EXCHANGE_SOURCES, ON_EXCHANGE_SOURCES } from "./sourceCatalog";

describe("source catalog", () => {
  it("prioritizes Tiantian/East Money F10 pages for off-exchange limits and fees", () => {
    expect(OFF_EXCHANGE_SOURCES[0].name).toBe("tiantian-f10-jjfl");
    expect(OFF_EXCHANGE_SOURCES[0].endpointPattern).toContain("fundf10.eastmoney.com/jjfl_{code}.html");
    expect(OFF_EXCHANGE_SOURCES[0].parsingMode).toBe("html");
  });

  it("uses daily close plus same-date NAV for on-exchange premium calculation", () => {
    expect(ON_EXCHANGE_SOURCES.map((source) => source.name)).toEqual([
      "akshare-eastmoney-etf-lof-hist",
      "akshare-eastmoney-open-fund-nav",
      "eastmoney-etf-spot-cross-check"
    ]);
  });

  it("uses fund_portfolio_hold_em as the first holdings source", () => {
    expect(HOLDING_SOURCES[0].endpointPattern).toContain("fund_portfolio_hold_em");
  });
});
```

- [ ] **Step 4: Run tests to verify failure**

Run: `npm test -- src/domain/quotes.test.ts src/domain/holdings.test.ts src/providers/sourceCatalog.test.ts`

Expected: FAIL because the new modules do not exist.

- [ ] **Step 5: Implement quote calculation**

```ts
// src/domain/quotes.ts
interface ClosingPremiumInput {
  closePrice: number;
  unitNav: number;
  tradeDate: string;
  navDate: string;
}

export function calculateClosingPremiumDiscount(input: ClosingPremiumInput): number | null {
  if (input.tradeDate !== input.navDate) return null;
  if (!Number.isFinite(input.closePrice) || !Number.isFinite(input.unitNav) || input.unitNav <= 0) return null;
  return (input.closePrice - input.unitNav) / input.unitNav;
}
```

- [ ] **Step 6: Implement holding alias matching**

```ts
// src/domain/holdings.ts
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
  return value.trim().toUpperCase().replace(/\\s+/g, " ");
}
```

- [ ] **Step 7: Implement source catalog**

```ts
// src/providers/sourceCatalog.ts
export type ParsingMode = "json" | "js_wrapped_json" | "html" | "library_adapter";

export interface SourceDescriptor {
  name: string;
  endpointPattern: string;
  parsingMode: ParsingMode;
  provides: string[];
  notes: string;
}

export const OFF_EXCHANGE_SOURCES: SourceDescriptor[] = [
  {
    name: "tiantian-f10-jjfl",
    endpointPattern: "https://fundf10.eastmoney.com/jjfl_{code}.html",
    parsingMode: "html",
    provides: ["purchase_status", "purchase_limit_text", "subscription_fee_tiers", "redemption_fee_tiers", "management_fee", "custodian_fee", "sales_service_fee"],
    notes: "Primary off-exchange source. Parse carefully because fee and limit text can be table or free text."
  },
  {
    name: "eastmoney-fundcode-search",
    endpointPattern: "https://fund.eastmoney.com/js/fundcode_search.js",
    parsingMode: "js_wrapped_json",
    provides: ["fund_universe", "fund_name", "fund_type", "share_class_hint"],
    notes: "Use for initial fund universe and share-class suffix inference."
  },
  {
    name: "eastmoney-f10-lsjz-status",
    endpointPattern: "https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz&code={code}&page=1&per=1",
    parsingMode: "js_wrapped_json",
    provides: ["subscribe_status", "redeem_status", "nav_date"],
    notes: "Fallback status cross-check. Do not silently override newer detail-page data when dates differ."
  }
];

export const ON_EXCHANGE_SOURCES: SourceDescriptor[] = [
  {
    name: "akshare-eastmoney-etf-lof-hist",
    endpointPattern: "ak.fund_etf_hist_em(symbol, period='daily', adjust='') / ak.fund_lof_hist_em(symbol, period='daily', adjust='')",
    parsingMode: "library_adapter",
    provides: ["close_price", "turnover", "trade_date"],
    notes: "Primary source for previous completed trading day close and turnover."
  },
  {
    name: "akshare-eastmoney-open-fund-nav",
    endpointPattern: "ak.fund_open_fund_info_em(symbol, indicator='单位净值走势')",
    parsingMode: "library_adapter",
    provides: ["unit_nav", "nav_date"],
    notes: "Use only when nav_date exactly matches trade_date; otherwise leave closing premium/discount null."
  },
  {
    name: "eastmoney-etf-spot-cross-check",
    endpointPattern: "ak.fund_etf_spot_em() / East Money push2delay clist",
    parsingMode: "library_adapter",
    provides: ["quote_screen_premium_discount", "latest_price", "turnover"],
    notes: "ETF-only lower-confidence cross-check. Do not use for intraday estimated NAV in the first release."
  }
];

export const HOLDING_SOURCES: SourceDescriptor[] = [
  {
    name: "akshare-eastmoney-fund-portfolio-hold",
    endpointPattern: "ak.fund_portfolio_hold_em(symbol='{fundCode}', date='{year}')",
    parsingMode: "library_adapter",
    provides: ["stock_code", "stock_name", "nav_percent", "holding_market_value", "report_period"],
    notes: "Primary holdings source for report-period concentration ranking. Match overseas stocks by code and alias."
  },
  {
    name: "eastmoney-f10-jjcc",
    endpointPattern: "https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code={code}&year={year}&topline=10",
    parsingMode: "js_wrapped_json",
    provides: ["stock_name", "nav_percent", "holding_market_value", "report_period"],
    notes: "Fallback holdings source with JS-wrapped HTML content."
  }
];
```

- [ ] **Step 8: Run tests**

Run: `npm test -- src/domain/quotes.test.ts src/domain/holdings.test.ts src/providers/sourceCatalog.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit source rules**

```bash
git add src/domain/quotes.ts src/domain/holdings.ts src/providers/sourceCatalog.ts src/domain/quotes.test.ts src/domain/holdings.test.ts src/providers/sourceCatalog.test.ts
git commit -m "Add data source and quote rules"
```

## Task 6: SQLite Schema and Repository

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/database.ts`
- Create: `src/db/repositories.ts`
- Test: `src/db/repositories.test.ts`

- [ ] **Step 1: Write failing repository test**

```ts
// src/db/repositories.test.ts
import { describe, expect, it } from "vitest";
import { createInMemoryDatabase } from "./database";
import { insertSnapshotBundle, queryIndexComparison } from "./repositories";

describe("repositories", () => {
  it("returns grouped index comparison rows from latest snapshots", () => {
    const db = createInMemoryDatabase();
    insertSnapshotBundle(db, {
      syncRunId: "run-1",
      funds: [
        { code: "513100", name: "纳指ETF", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true },
        { code: "000834", name: "纳指100联接A", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "A", parentFundCode: "000834", enabled: true }
      ],
      quotes: [{ fundCode: "513100", closePrice: 1.23, closingPremiumDiscountRate: 0.012, turnover: 120000000, tradeDate: "2026-06-08", source: "eastmoney", syncRunId: "run-1" }],
      limits: [{ fundCode: "000834", shareClass: "A", status: "limited", limitAmountYuan: 1000, limitUnit: "per_day", channelScope: "agency", source: "tiantian", dataDate: "2026-06-09", confidence: 0.9, syncRunId: "run-1" }],
      fees: [],
      holdings: []
    });

    const result = queryIndexComparison(db, "NASDAQ_100");

    expect(result.onExchange).toHaveLength(1);
    expect(result.offExchange).toHaveLength(1);
    expect(result.offExchange[0].limitAmountYuan).toBe(1000);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- src/db/repositories.test.ts`

Expected: FAIL because database files do not exist.

- [ ] **Step 3: Implement schema and database helper**

```ts
// src/db/schema.ts
import type Database from "better-sqlite3";

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS funds (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      fund_type TEXT NOT NULL,
      venue TEXT NOT NULL,
      fund_company TEXT,
      tracking_target_code TEXT,
      share_class TEXT NOT NULL,
      parent_fund_code TEXT,
      enabled INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fund_quotes (
      fund_code TEXT NOT NULL,
      close_price REAL NOT NULL,
      closing_premium_discount_rate REAL,
      turnover REAL,
      trade_date TEXT NOT NULL,
      source TEXT NOT NULL,
      sync_run_id TEXT NOT NULL,
      PRIMARY KEY (fund_code, trade_date, source)
    );

    CREATE TABLE IF NOT EXISTS purchase_limits (
      fund_code TEXT NOT NULL,
      share_class TEXT NOT NULL,
      status TEXT NOT NULL,
      limit_amount_yuan REAL,
      limit_unit TEXT,
      channel_scope TEXT NOT NULL,
      source TEXT NOT NULL,
      data_date TEXT NOT NULL,
      confidence REAL NOT NULL,
      sync_run_id TEXT NOT NULL,
      PRIMARY KEY (fund_code, share_class, channel_scope, data_date, source)
    );

    CREATE TABLE IF NOT EXISTS fund_fees (
      fund_code TEXT NOT NULL,
      fee_type TEXT NOT NULL,
      rate REAL NOT NULL,
      min_holding_days INTEGER,
      max_holding_days INTEGER,
      amount_tier_lower_bound REAL,
      amount_tier_upper_bound REAL,
      channel_scope TEXT NOT NULL,
      source TEXT NOT NULL,
      data_date TEXT NOT NULL,
      sync_run_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fund_holdings (
      fund_code TEXT NOT NULL,
      stock_code TEXT NOT NULL,
      stock_name TEXT NOT NULL,
      nav_percent REAL NOT NULL,
      holding_market_value REAL,
      report_period TEXT NOT NULL,
      source TEXT NOT NULL,
      sync_run_id TEXT NOT NULL,
      PRIMARY KEY (fund_code, stock_code, report_period, source)
    );
  `);
}
```

```ts
// src/db/database.ts
import Database from "better-sqlite3";
import { migrate } from "./schema";

export function createInMemoryDatabase(): Database.Database {
  const db = new Database(":memory:");
  migrate(db);
  return db;
}

export function openDatabase(path = "data/etflimit.sqlite"): Database.Database {
  const db = new Database(path);
  migrate(db);
  return db;
}
```

- [ ] **Step 4: Implement repository**

```ts
// src/db/repositories.ts
import type Database from "better-sqlite3";
import type { FeeTier, Fund, FundHolding, FundQuote, PurchaseLimit } from "../domain/types";

export interface SnapshotBundle {
  syncRunId: string;
  funds: Fund[];
  quotes: FundQuote[];
  limits: PurchaseLimit[];
  fees: FeeTier[];
  holdings: FundHolding[];
}

export function insertSnapshotBundle(db: Database.Database, bundle: SnapshotBundle): void {
  const insertFund = db.prepare(`INSERT OR REPLACE INTO funds VALUES (@code, @name, @fundType, @venue, @fundCompany, @trackingTargetCode, @shareClass, @parentFundCode, @enabled)`);
  const insertQuote = db.prepare(`INSERT OR REPLACE INTO fund_quotes VALUES (@fundCode, @closePrice, @closingPremiumDiscountRate, @turnover, @tradeDate, @source, @syncRunId)`);
  const insertLimit = db.prepare(`INSERT OR REPLACE INTO purchase_limits VALUES (@fundCode, @shareClass, @status, @limitAmountYuan, @limitUnit, @channelScope, @source, @dataDate, @confidence, @syncRunId)`);

  const tx = db.transaction(() => {
    for (const fund of bundle.funds) insertFund.run({ ...fund, enabled: fund.enabled ? 1 : 0 });
    for (const quote of bundle.quotes) insertQuote.run(quote);
    for (const limit of bundle.limits) insertLimit.run(limit);
  });

  tx();
}

export function queryIndexComparison(db: Database.Database, targetCode: string): { onExchange: any[]; offExchange: any[] } {
  const rows = db.prepare(`
    SELECT
      f.code,
      f.name,
      f.venue,
      f.share_class AS shareClass,
      q.close_price AS closePrice,
      q.closing_premium_discount_rate AS closingPremiumDiscountRate,
      q.turnover,
      q.trade_date AS tradeDate,
      l.status,
      l.limit_amount_yuan AS limitAmountYuan,
      l.channel_scope AS channelScope
    FROM funds f
    LEFT JOIN fund_quotes q ON q.fund_code = f.code
    LEFT JOIN purchase_limits l ON l.fund_code = f.code
    WHERE f.tracking_target_code = ? AND f.enabled = 1
  `).all(targetCode);

  return {
    onExchange: rows.filter((row: any) => row.venue === "on_exchange"),
    offExchange: rows.filter((row: any) => row.venue === "off_exchange")
  };
}
```

- [ ] **Step 5: Run repository test**

Run: `npm test -- src/db/repositories.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit database layer**

```bash
git add src/db/schema.ts src/db/database.ts src/db/repositories.ts src/db/repositories.test.ts
git commit -m "Add SQLite snapshot repository"
```

## Task 7: Mock Sync Runner

**Files:**
- Create: `src/providers/mockProviders.ts`
- Create: `src/sync/syncRunner.ts`
- Create: `src/sync/cli.ts`
- Test: `src/sync/syncRunner.test.ts`

- [ ] **Step 1: Write failing sync test**

```ts
// src/sync/syncRunner.test.ts
import { describe, expect, it } from "vitest";
import { createInMemoryDatabase } from "../db/database";
import { queryIndexComparison } from "../db/repositories";
import { runDailySync } from "./syncRunner";

describe("sync runner", () => {
  it("writes mock snapshots and keeps them queryable", async () => {
    const db = createInMemoryDatabase();
    await runDailySync(db);
    const result = queryIndexComparison(db, "NASDAQ_100");
    expect(result.onExchange.length).toBeGreaterThan(0);
    expect(result.offExchange.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- src/sync/syncRunner.test.ts`

Expected: FAIL because sync runner does not exist.

- [ ] **Step 3: Implement mock providers and runner**

```ts
// src/providers/mockProviders.ts
import type { FeeTier, Fund, FundHolding, FundQuote, PurchaseLimit } from "../domain/types";

export const mockFunds: Fund[] = [
  { code: "513100", name: "纳指ETF", fundType: "ETF", venue: "on_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "ETF", enabled: true },
  { code: "000834", name: "纳指100联接A", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "A", parentFundCode: "000834", enabled: true },
  { code: "016532", name: "纳指100联接C", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "C", parentFundCode: "000834", enabled: true },
  { code: "020123", name: "纳指100联接F", fundType: "QDII", venue: "off_exchange", trackingTargetCode: "NASDAQ_100", shareClass: "F", parentFundCode: "000834", enabled: true }
];

export const mockQuotes: FundQuote[] = [
  { fundCode: "513100", closePrice: 1.23, closingPremiumDiscountRate: 0.012, turnover: 120000000, tradeDate: "2026-06-08", source: "eastmoney", syncRunId: "mock-run" }
];

export const mockLimits: PurchaseLimit[] = [
  { fundCode: "000834", shareClass: "A", status: "limited", limitAmountYuan: 1000, limitUnit: "per_day", channelScope: "agency", source: "tiantian", dataDate: "2026-06-09", confidence: 0.9, syncRunId: "mock-run" },
  { fundCode: "016532", shareClass: "C", status: "limited", limitAmountYuan: 1000, limitUnit: "per_day", channelScope: "agency", source: "tiantian", dataDate: "2026-06-09", confidence: 0.9, syncRunId: "mock-run" },
  { fundCode: "020123", shareClass: "F", status: "limited", limitAmountYuan: 10000, limitUnit: "per_day", channelScope: "direct", source: "tiantian", dataDate: "2026-06-09", confidence: 0.85, syncRunId: "mock-run" }
];

export const mockFees: FeeTier[] = [];
export const mockHoldings: FundHolding[] = [
  { fundCode: "513100", stockCode: "NVDA", stockName: "英伟达", navPercent: 8.5, reportPeriod: "2026Q1", source: "eastmoney", syncRunId: "mock-run" }
];
```

```ts
// src/sync/syncRunner.ts
import type Database from "better-sqlite3";
import { insertSnapshotBundle } from "../db/repositories";
import { mockFees, mockFunds, mockHoldings, mockLimits, mockQuotes } from "../providers/mockProviders";

export async function runDailySync(db: Database.Database): Promise<void> {
  insertSnapshotBundle(db, {
    syncRunId: "mock-run",
    funds: mockFunds,
    quotes: mockQuotes,
    limits: mockLimits,
    fees: mockFees,
    holdings: mockHoldings
  });
}
```

```ts
// src/sync/cli.ts
import { openDatabase } from "../db/database";
import { runDailySync } from "./syncRunner";

const command = process.argv[2] ?? "daily";
const db = openDatabase();

if (["daily", "quotes", "limits", "fees", "holdings"].includes(command)) {
  await runDailySync(db);
  console.log(`sync:${command} completed`);
} else {
  console.error(`Unknown sync command: ${command}`);
  process.exitCode = 1;
}
```

- [ ] **Step 4: Run sync test**

Run: `npm test -- src/sync/syncRunner.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit sync runner**

```bash
git add src/providers/mockProviders.ts src/sync/syncRunner.ts src/sync/cli.ts src/sync/syncRunner.test.ts
git commit -m "Add mock daily sync runner"
```

## Task 8: Local API

**Files:**
- Create: `src/api/server.ts`
- Create: `src/api/client.ts`
- Test: `src/api/server.test.ts`

- [ ] **Step 1: Write failing API test**

```ts
// src/api/server.test.ts
import { describe, expect, it } from "vitest";
import { createInMemoryDatabase } from "../db/database";
import { runDailySync } from "../sync/syncRunner";
import { createApp } from "./server";

describe("local API", () => {
  it("serves index comparison data", async () => {
    const db = createInMemoryDatabase();
    await runDailySync(db);
    const app = createApp(db);
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP server address");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/index-comparison/NASDAQ_100`);
    const data = await response.json();
    server.close();

    expect(response.status).toBe(200);
    expect(data.onExchange.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- src/api/server.test.ts`

Expected: FAIL because API files do not exist.

- [ ] **Step 3: Implement API**

```ts
// src/api/server.ts
import express from "express";
import type Database from "better-sqlite3";
import { openDatabase } from "../db/database";
import { queryIndexComparison } from "../db/repositories";
import { TARGETS } from "../domain/targets";

export function createApp(db: Database.Database) {
  const app = express();

  app.get("/api/targets", (_req, res) => {
    res.json(TARGETS);
  });

  app.get("/api/index-comparison/:targetCode", (req, res) => {
    res.json(queryIndexComparison(db, req.params.targetCode));
  });

  app.get("/api/status", (_req, res) => {
    res.json({
      quote: { status: "ok", lastSuccess: "2026-06-09", source: "eastmoney" },
      purchaseLimit: { status: "ok", lastSuccess: "2026-06-09", source: "tiantian" },
      fee: { status: "ok", lastSuccess: "2026-06-09", source: "tiantian" },
      holding: { status: "ok", lastSuccess: "2026Q1", source: "eastmoney" }
    });
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787);
  createApp(openDatabase()).listen(port, "127.0.0.1", () => {
    console.log(`ETF Limit API listening on http://127.0.0.1:${port}`);
  });
}
```

```ts
// src/api/client.ts
import type { Target } from "../domain/types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8787";

export async function fetchTargets(): Promise<Target[]> {
  const response = await fetch(`${API_BASE}/api/targets`);
  if (!response.ok) throw new Error(`Failed to fetch targets: ${response.status}`);
  return response.json();
}

export async function fetchIndexComparison(targetCode: string): Promise<{ onExchange: any[]; offExchange: any[] }> {
  const response = await fetch(`${API_BASE}/api/index-comparison/${targetCode}`);
  if (!response.ok) throw new Error(`Failed to fetch index comparison: ${response.status}`);
  return response.json();
}

export async function fetchSyncStatus(): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE}/api/status`);
  if (!response.ok) throw new Error(`Failed to fetch sync status: ${response.status}`);
  return response.json();
}
```

- [ ] **Step 4: Run API test**

Run: `npm test -- src/api/server.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit API**

```bash
git add src/api/server.ts src/api/client.ts src/api/server.test.ts
git commit -m "Add local comparison API"
```

## Task 9: First React UI

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Create: `src/ui/DataStatus.tsx`
- Create: `src/ui/IndexComparison.tsx`
- Create: `src/ui/StockConcentration.tsx`
- Test: `src/ui/IndexComparison.test.tsx`

- [ ] **Step 1: Write failing UI test**

```tsx
// src/ui/IndexComparison.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IndexComparison } from "./IndexComparison";

describe("IndexComparison", () => {
  it("labels premium as previous close reference data", () => {
    render(
      <IndexComparison
        targetName="纳斯达克100"
        data={{
          onExchange: [{ code: "513100", name: "纳指ETF", closePrice: 1.23, closingPremiumDiscountRate: 0.012, turnover: 120000000, tradeDate: "2026-06-08", source: "eastmoney" }],
          offExchange: [{ code: "000834", name: "纳指100联接A", shareClass: "A", status: "limited", limitAmountYuan: 1000, channelScope: "agency", source: "tiantian" }]
        }}
      />
    );

    expect(screen.getByText("昨日收盘折溢价")).toBeInTheDocument();
    expect(screen.getByText(/仅供参考/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run UI test to verify failure**

Run: `npm test -- src/ui/IndexComparison.test.tsx`

Expected: FAIL because UI component does not exist.

- [ ] **Step 3: Implement UI components**

```tsx
// src/ui/IndexComparison.tsx
import { formatPercent } from "../domain/fees";

interface Props {
  targetName: string;
  data: { onExchange: any[]; offExchange: any[] };
}

export function IndexComparison({ targetName, data }: Props) {
  return (
    <section className="panel">
      <h2>{targetName} 同标的产品比较</h2>
      <p className="note">昨日收盘折溢价仅供参考，不代表当前盘中折溢价。</p>
      <h3>场内 ETF/LOF</h3>
      <table>
        <thead>
          <tr>
            <th>代码</th>
            <th>名称</th>
            <th>昨日收盘价</th>
            <th>昨日收盘折溢价</th>
            <th>成交额</th>
            <th>日期</th>
            <th>来源</th>
          </tr>
        </thead>
        <tbody>
          {data.onExchange.map((row) => (
            <tr key={row.code}>
              <td>{row.code}</td>
              <td>{row.name}</td>
              <td>{row.closePrice}</td>
              <td>{row.closingPremiumDiscountRate == null ? "同日净值缺失" : formatPercent(row.closingPremiumDiscountRate)}</td>
              <td>{row.turnover ?? "-"}</td>
              <td>{row.tradeDate}</td>
              <td>{row.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>场外 A/C/F 份额</h3>
      <table>
        <thead>
          <tr>
            <th>代码</th>
            <th>名称</th>
            <th>份额</th>
            <th>申购状态</th>
            <th>限额</th>
            <th>渠道范围</th>
            <th>来源</th>
          </tr>
        </thead>
        <tbody>
          {data.offExchange.map((row) => (
            <tr key={row.code}>
              <td>{row.code}</td>
              <td>{row.name}</td>
              <td>{row.shareClass}</td>
              <td>{row.status}</td>
              <td>{row.limitAmountYuan ?? "未知"}</td>
              <td>{row.channelScope}</td>
              <td>{row.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

```tsx
// src/ui/DataStatus.tsx
export function DataStatus() {
  return (
    <aside className="status-strip">
      <span>行情：上一交易日收盘快照</span>
      <span>限购：每日同步</span>
      <span>持仓：基金报告期数据</span>
    </aside>
  );
}
```

```tsx
// src/ui/StockConcentration.tsx
export function StockConcentration() {
  return (
    <section className="panel">
      <h2>热门股票持仓浓度</h2>
      <p className="note">持仓来自基金定期报告，不代表实时持仓。</p>
    </section>
  );
}
```

- [ ] **Step 4: Update app shell**

```tsx
// src/App.tsx
import { useEffect, useState } from "react";
import { fetchIndexComparison } from "./api/client";
import { DataStatus } from "./ui/DataStatus";
import { IndexComparison } from "./ui/IndexComparison";
import { StockConcentration } from "./ui/StockConcentration";

export function App() {
  const [data, setData] = useState<{ onExchange: any[]; offExchange: any[] } | null>(null);

  useEffect(() => {
    fetchIndexComparison("NASDAQ_100")
      .then(setData)
      .catch(() => {
        setData({
          onExchange: [{ code: "513100", name: "纳指ETF", closePrice: 1.23, closingPremiumDiscountRate: 0.012, turnover: 120000000, tradeDate: "2026-06-08", source: "mock" }],
          offExchange: [{ code: "000834", name: "纳指100联接A", shareClass: "A", status: "limited", limitAmountYuan: 1000, channelScope: "agency", source: "mock" }]
        });
      });
  }, []);

  return (
    <main className="app-shell">
      <header className="hero">
        <h1>ETF Limit</h1>
        <p>境外标的基金限购、费率、昨日收盘折溢价和持仓浓度比较工具。</p>
      </header>
      <DataStatus />
      {data ? <IndexComparison targetName="纳斯达克100" data={data} /> : <p>加载中...</p>}
      <StockConcentration />
    </main>
  );
}
```

- [ ] **Step 5: Extend styles**

```css
/* append to src/styles.css */
.hero {
  margin-bottom: 24px;
}

.hero h1 {
  margin: 0 0 8px;
  font-size: 32px;
}

.panel {
  background: #ffffff;
  border: 1px solid #dce3ea;
  border-radius: 8px;
  margin-top: 20px;
  padding: 20px;
}

.note {
  color: #5f6f7a;
}

.status-strip {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  background: #e9f1f7;
  border: 1px solid #cad9e5;
  border-radius: 8px;
  padding: 12px;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
}

th,
td {
  border-bottom: 1px solid #e2e8ee;
  padding: 10px;
  text-align: left;
}
```

- [ ] **Step 6: Run UI test**

Run: `npm test -- src/ui/IndexComparison.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit UI**

```bash
git add src/App.tsx src/styles.css src/ui/DataStatus.tsx src/ui/IndexComparison.tsx src/ui/StockConcentration.tsx src/ui/IndexComparison.test.tsx
git commit -m "Add first comparison UI"
```

## Task 10: Verification and Local Run

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add README**

```md
# ETF Limit

Local web tool for comparing mainland China funds that provide exposure to overseas indices and popular overseas stocks.

## Commands

- `npm install`: install dependencies.
- `npm run sync:daily`: write the latest available validated snapshots.
- `npm run api`: start the local API at `http://127.0.0.1:8787`.
- `npm run dev`: start the Vite UI at `http://127.0.0.1:5173`.
- `npm test`: run unit and UI tests.

## Data Freshness

On-exchange ETF/LOF premium or discount data uses the previous trading day's closing premium or discount and is for reference only. The first release does not calculate intraday estimated NAV or real-time premium/discount.

Off-exchange purchase limits are modeled by share class. A and C classes usually share agency-channel limits; F classes usually represent direct-sale or special-channel products and may have higher limits.
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: TypeScript and Vite build PASS.

- [ ] **Step 4: Run mock daily sync**

Run: `npm run sync:daily`

Expected: `sync:daily completed`.

- [ ] **Step 5: Start API**

Run: `npm run api`

Expected: `ETF Limit API listening on http://127.0.0.1:8787`.

- [ ] **Step 6: Start UI**

Run: `npm run dev`

Expected: Vite prints a local URL such as `http://127.0.0.1:5173/`.

- [ ] **Step 7: Browser verification**

Open `http://127.0.0.1:5173/`.

Expected:

- Page title is `ETF Limit`.
- Data status strip is visible.
- Nasdaq 100 table shows on-exchange and off-exchange sections.
- On-exchange premium column says `昨日收盘折溢价`.
- Reference note says the premium is for reference only.
- Off-exchange table shows A/C/F style share class and channel-scope fields.

- [ ] **Step 8: Commit verification docs**

```bash
git add README.md
git commit -m "Document local ETF limit workflow"
```

## Self-Review Notes

- Spec coverage: the plan covers scaffold, targets, fee assumptions, purchase-limit share-class assumptions, provider fallback, explicit data-source catalog, previous-close premium calculation rules, holding alias matching, SQLite snapshots, sync commands, local API, UI, and verification. Real provider scraping is intentionally deferred behind provider interfaces and mock providers for the first working vertical slice, but the source catalog locks in first-release provider priorities and parser expectations.
- Placeholder scan: no task depends on an unspecified function without first creating it in an earlier task.
- Type consistency: domain names use `closingPremiumDiscountRate`, `channelScope`, `shareClass`, and `syncRunId` consistently across types, repository, sync, API, and UI.
