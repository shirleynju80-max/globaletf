import type { RequestHandler } from "express";

export function cachePublic(maxAgeSeconds: number, staleWhileRevalidateSeconds = 0): RequestHandler {
  return (_req, res, next) => {
    const swr = staleWhileRevalidateSeconds > 0 ? `, stale-while-revalidate=${staleWhileRevalidateSeconds}` : "";
    res.setHeader("Cache-Control", `public, max-age=${maxAgeSeconds}${swr}`);
    next();
  };
}

export function noStore(): RequestHandler {
  return (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  };
}
