export interface ApiProxyConfig {
  resolveIp: string;
  originHost: string;
  upstreamPath: string;
}

const DEFAULT_RESOLVE_IP = "8.147.67.18";

export function parseIpv4Origin(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(trimmed)) return trimmed;
  try {
    const host = new URL(trimmed).hostname;
    return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

export function buildApiProxyConfig(
  requestUrl: URL,
  pathParam: string | string[] | undefined,
  env: { API_RESOLVE_IP?: string; API_ORIGIN_HOST?: string; API_ORIGIN?: string } = {}
): ApiProxyConfig {
  const resolveIp = env.API_RESOLVE_IP ?? parseIpv4Origin(env.API_ORIGIN) ?? DEFAULT_RESOLVE_IP;
  const originHost = env.API_ORIGIN_HOST ?? resolveIp;
  const suffix = Array.isArray(pathParam) ? pathParam.join("/") : pathParam ?? "";
  const upstreamPath = suffix ? `/api/${suffix}${requestUrl.search}` : `/api${requestUrl.search}`;
  return { resolveIp, originHost, upstreamPath };
}

/** URL host must not be a raw IP — Cloudflare blocks direct IP subrequests (error 1003). */
export function buildOriginFetchUrl(config: ApiProxyConfig): string {
  return new URL(config.upstreamPath, "http://globaletf-origin.internal/").toString();
}
