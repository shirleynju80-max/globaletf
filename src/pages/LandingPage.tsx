import { useEffect, useState } from "react";
import { fetchIndexComparison, fetchLandingStats, fetchLivePremium, fetchStockConcentration } from "../api/client";
import { SITE_NAME, SITE_TAGLINE } from "../lib/brand";
import { navigateTo } from "../lib/navigation";
import { SiteNav } from "../ui/SiteNav";
import {
  buildIndexPreviewRows,
  buildStockPreviewRows,
  FALLBACK_INDEX_PREVIEW_ROWS,
  FALLBACK_STOCK_PREVIEW_ROWS,
  LANDING_INDEX_PREVIEW_TARGET,
  LANDING_STOCK_PREVIEW_CODE,
  type LandingIndexPreviewRow,
  type LandingStockPreviewRow
} from "./landingPreview";

const PRODUCTS = [
  {
    id: "indices",
    path: "/indices",
    eyebrow: "指数跟踪",
    title: "同指数产品一站对比",
    description: "覆盖纳斯达克100、标普500、日经225、恒生科技等主流指数。场内实时跟踪折溢价、场外展示申购限额、费率、渠道。",
    cta: "进入指数跟踪",
    previewTableClass: "landing-preview-table--indices",
    previewTitle: "NASDAQ_100 · 场内折溢价",
    previewColumns: [
      { key: "code", header: "代码", className: "col-code mono" },
      { key: "name", header: "名称", className: "col-name" },
      { key: "premium", header: "折溢价", className: "col-premium", positive: true },
      { key: "closing", header: "昨收", className: "col-closing" },
      { key: "tail", header: "成交额", className: "col-tail" }
    ],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <path d="M3 17l6-6 4 4 8-10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 5h7v7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  },
  {
    id: "stocks",
    path: "/stocks",
    eyebrow: "股票持仓",
    title: "热门股票持仓浓度",
    description: "NVDA 等热门标的一键查询，从全量 QDII 季报持仓反向发现基金，按净值占比排序。",
    cta: "查看股票持仓",
    previewTableClass: "landing-preview-table--stocks",
    previewTitle: "NVDA · 2026Q1 持仓排名",
    previewColumns: [
      { key: "code", header: "代码", className: "col-code mono" },
      { key: "name", header: "名称", className: "col-name" },
      { key: "navPercent", header: "净值占比", className: "col-nav" },
      { key: "kind", header: "类型", className: "col-kind" },
      { key: "period", header: "报告期", className: "col-period" }
    ],
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <path d="M4 19V5" strokeLinecap="round" />
        <path d="M4 19h16" strokeLinecap="round" />
        <rect x="7" y="11" width="3" height="8" rx="0.5" />
        <rect x="12" y="8" width="3" height="11" rx="0.5" />
        <rect x="17" y="13" width="3" height="6" rx="0.5" />
      </svg>
    )
  }
] as const;

export function LandingPage() {
  const [indexPreviewRows, setIndexPreviewRows] = useState<LandingIndexPreviewRow[]>(FALLBACK_INDEX_PREVIEW_ROWS);
  const [stockPreviewRows, setStockPreviewRows] = useState<LandingStockPreviewRow[]>(FALLBACK_STOCK_PREVIEW_ROWS);
  const [landingStats, setLandingStats] = useState({
    trackingIndexLabel: "4+",
    stockIndexLabel: "600+"
  });

  useEffect(() => {
    document.title = `${SITE_NAME} — 跨境基金指数跟踪与股票持仓`;
    return () => {
      document.title = SITE_NAME;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;

    Promise.all([
      fetchIndexComparison(LANDING_INDEX_PREVIEW_TARGET),
      fetchLivePremium(LANDING_INDEX_PREVIEW_TARGET),
      fetchStockConcentration(LANDING_STOCK_PREVIEW_CODE, { expandPeers: false }),
      fetchLandingStats()
    ])
      .then(([comparison, livePremium, stockConcentration, stats]) => {
        if (!isCurrent) return;
        const livePremiumMap = Object.fromEntries(
          (livePremium.rows ?? []).map((row) => [row.fundCode, row])
        );
        const nextIndexRows = buildIndexPreviewRows(comparison.onExchange ?? [], livePremiumMap);
        if (nextIndexRows.length > 0) setIndexPreviewRows(nextIndexRows);
        const nextStockRows = buildStockPreviewRows(stockConcentration.rows ?? []);
        if (nextStockRows.length > 0) setStockPreviewRows(nextStockRows);
        setLandingStats({
          trackingIndexLabel: stats.trackingIndexLabel,
          stockIndexLabel: stats.stockIndexLabel
        });
      })
      .catch(() => {
        // Keep static fallbacks when API is unavailable.
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const previewRowsByProduct = {
    indices: indexPreviewRows,
    stocks: stockPreviewRows
  } as const;

  return (
    <div className="landing">
      <div className="landing-grid-bg" aria-hidden="true" />
      <SiteNav active="home" />

      <main>
        <section className="landing-hero landing-hero-centered">
          <div className="landing-hero-copy landing-hero-copy-wide">
            <p className="landing-eyebrow">Cross-border fund intelligence</p>
            <h1>
              跨境基金
              <span className="landing-hero-accent"> 指数跟踪</span>
              与
              <span className="landing-hero-accent"> 股票持仓</span>
            </h1>
            <div className="landing-hero-actions landing-hero-actions-center">
              <button type="button" className="landing-btn landing-btn-cta" onClick={() => navigateTo("/indices")}>
                指数跟踪
              </button>
              <button type="button" className="landing-btn landing-btn-ghost" onClick={() => navigateTo("/stocks")}>
                股票持仓
              </button>
            </div>
          </div>
        </section>

        <section className="landing-section" id="products">
          <div className="landing-section-head landing-section-head-center">
            <p className="landing-eyebrow">Two core products</p>
            <h2>两大功能，覆盖跨境配置最常见的两类问题</h2>
            <p>跟踪同一指数的基金能买哪只？哪些基金在季报里重仓了 NVDA？</p>
          </div>
          <div className="landing-product-grid">
            {PRODUCTS.map((product) => (
              <article key={product.id} className="landing-product-card">
                <div className="landing-product-card-head">
                  <div className="landing-feature-icon">{product.icon}</div>
                  <div>
                    <p className="landing-eyebrow">{product.eyebrow}</p>
                    <h3>{product.title}</h3>
                  </div>
                </div>
                <p>{product.description}</p>
                <div className="landing-preview-card">
                  <div className="landing-preview-toolbar">
                    <span className="landing-preview-dot" />
                    <span className="landing-preview-dot" />
                    <span className="landing-preview-dot" />
                    <span className="landing-preview-title">{product.previewTitle}</span>
                  </div>
                  <table className={`landing-preview-table ${product.previewTableClass}`}>
                    <thead>
                      <tr>
                        {product.previewColumns.map((column) => (
                          <th key={column.key} className={column.className}>
                            {column.header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRowsByProduct[product.id].map((row) => (
                        <tr key={row.code}>
                          {product.previewColumns.map((column) => {
                            const value = row[column.key as keyof typeof row];
                            const positive = "positive" in column && column.positive && typeof value === "string" && value.startsWith("+");
                            return (
                              <td key={column.key} className={[column.className, positive ? "positive" : ""].filter(Boolean).join(" ")}>
                                {value}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button type="button" className="landing-btn landing-btn-cta" onClick={() => navigateTo(product.path)}>
                  {product.cta}
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section landing-section-alt">
          <div className="landing-highlight landing-highlight-single">
            <div>
              <p className="landing-eyebrow">Why {SITE_NAME}</p>
              <h2>公开、专注、数据可核对</h2>
              <p>
                指数跟踪页聚焦折溢价与限购，股票持仓页聚焦季报披露权重；数据均来自公开行情与基金定期报告。
              </p>
            </div>
            <dl className="landing-kpis landing-kpis-inline">
              <div>
                <dt>跟踪指数</dt>
                <dd>{landingStats.trackingIndexLabel}</dd>
              </div>
              <div>
                <dt>股票</dt>
                <dd>{landingStats.stockIndexLabel}</dd>
              </div>
              <div>
                <dt>更新时效</dt>
                <dd>高</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="landing-cta-band">
          <h2>从你最关心的问题开始</h2>
          <p>选择指数对比，或直接查热门股票的基金持仓浓度。</p>
          <div className="landing-cta-band-actions">
            <button type="button" className="landing-btn landing-btn-cta landing-btn-lg" onClick={() => navigateTo("/indices")}>
              指数跟踪
            </button>
            <button type="button" className="landing-btn landing-btn-ghost landing-btn-lg landing-btn-on-dark" onClick={() => navigateTo("/stocks")}>
              股票持仓
            </button>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <p>{SITE_NAME} · {SITE_TAGLINE}</p>
        <p className="landing-footer-muted">数据来自公开渠道，不构成投资建议</p>
      </footer>
    </div>
  );
}
