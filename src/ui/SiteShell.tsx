import type { ReactNode } from "react";
import { SiteNav } from "./SiteNav";
import type { SiteSection } from "../lib/navigation";

interface Props {
  active: SiteSection;
  eyebrow?: string;
  title: string;
  lead?: string;
  children: ReactNode;
}

export function SiteShell({ active, eyebrow, title, lead, children }: Props) {
  return (
    <div className="landing site-page">
      <div className="landing-grid-bg" aria-hidden="true" />
      <SiteNav active={active} />
      <main className="site-main">
        <header className="site-page-header">
          {eyebrow ? <p className="landing-eyebrow">{eyebrow}</p> : null}
          <h1>{title}</h1>
          {lead ? <p className="site-page-lead">{lead}</p> : null}
        </header>
        {children}
      </main>
      <footer className="landing-footer">
        <p>ETF Limit · 跨境基金数据工具</p>
        <p className="landing-footer-muted">数据来自公开渠道，不构成投资建议</p>
      </footer>
    </div>
  );
}
