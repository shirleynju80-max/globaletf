import type { MouseEvent } from "react";
import { navigateTo } from "../lib/navigation";
import type { SiteSection } from "../lib/navigation";

interface Props {
  active: SiteSection;
}

export function SiteNav({ active }: Props) {
  function go(path: string, event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    navigateTo(path);
  }

  return (
    <header className="landing-nav">
      <a className="landing-brand" href="/" onClick={(event) => go("/", event)}>
        <span className="landing-brand-mark">EL</span>
        <span>ETF Limit</span>
      </a>
      <nav className="landing-nav-links" aria-label="站点导航">
        <a href="/indices" className={active === "indices" ? "active" : ""} onClick={(event) => go("/indices", event)}>
          指数跟踪
        </a>
        <a href="/stocks" className={active === "stocks" ? "active" : ""} onClick={(event) => go("/stocks", event)}>
          股票持仓
        </a>
      </nav>
      {active === "home" ? null : (
        <a className="landing-btn landing-btn-ghost landing-btn-sm" href="/" onClick={(event) => go("/", event)}>
          首页
        </a>
      )}
    </header>
  );
}
