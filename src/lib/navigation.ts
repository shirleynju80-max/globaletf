export function navigateTo(path: string): void {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export type SiteSection = "home" | "indices" | "stocks" | "status";
