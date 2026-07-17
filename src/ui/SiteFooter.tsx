import { SITE_NAME, SITE_TAGLINE } from "../lib/brand";
import { ICP_RECORD } from "../lib/compliance";
import { navigateTo } from "../lib/navigation";

export function SiteFooter() {
  return (
    <footer className="landing-footer">
      <p>{SITE_NAME} · {SITE_TAGLINE}</p>
      <p className="landing-footer-muted">
        <a href="/status" onClick={(event) => { event.preventDefault(); navigateTo("/status"); }}>数据状态</a>
        {" · "}数据来自公开渠道，不构成投资建议
      </p>
      <p className="landing-footer-muted">
        <a href={ICP_RECORD.href} target="_blank" rel="noreferrer">{ICP_RECORD.text}</a>
      </p>
    </footer>
  );
}
