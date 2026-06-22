import { useEffect, useState } from "react";
import { IndexPage } from "./pages/IndexPage";
import { LandingPage } from "./pages/LandingPage";
import { StockPage } from "./pages/StockPage";
import { navigateTo } from "./lib/navigation";

function resolvePage(pathname: string): "landing" | "indices" | "stocks" {
  if (pathname === "/indices" || pathname.startsWith("/indices/")) return "indices";
  if (pathname === "/stocks" || pathname.startsWith("/stocks/")) return "stocks";
  if (pathname === "/app" || pathname.startsWith("/app/")) return "indices";
  return "landing";
}

export function Root() {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (pathname === "/app" || pathname.startsWith("/app/")) {
      navigateTo("/indices");
    }
  }, [pathname]);

  const page = resolvePage(pathname);
  if (page === "indices") return <IndexPage />;
  if (page === "stocks") return <StockPage />;
  return <LandingPage />;
}
