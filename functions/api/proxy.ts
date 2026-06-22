export interface ApiProxyConfig {
  upstreamHost: string;
  originHost: string;
  upstreamPath: string;
}

const DEFAULT_ORIGIN_HOST = "8.147.67.18";
const DEFAULT_UPSTREAM_HOST = "8-147-67-18.sslip.io";

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

export function upstreamHostForIp(ip: string): string {
  return ip.replace(/\./g, "-") + ".sslip.io";
}

export function buildApiProxyConfig(
  requestUrl: URL,
  pathParam: string | string[] | undefined,
  env: { API_UPSTREAM_HOST?: string; API_ORIGIN_HOST?: string; API_RESOLVE_IP?: string; API_ORIGIN?: string } = {}
): ApiProxyConfig {
  const originHost = env.API_ORIGIN_HOST ?? parseIpv4Origin(env.API_ORIGIN) ?? env.API_RESOLVE_IP ?? DEFAULT_ORIGIN_HOST;
  const upstreamHost = env.API_UPSTREAM_HOST ?? upstreamHostForIp(originHost);
  const suffix = Array.isArray(pathParam) ? pathParam.join("/") : pathParam ?? "";
  const upstreamPath = suffix ? `/api/${suffix}${requestUrl.search}` : `/api${requestUrl.search}`;
  return { upstreamHost, originHost, upstreamPath };
}

/** Use a public hostname (not raw IP) so Cloudflare subrequests are allowed (avoids error 1003). */
export function buildOriginFetchUrl(config: ApiProxyConfig): string {
  return new URL(config.upstreamPath, `http://${config.upstreamHost}/`).toString();
}
