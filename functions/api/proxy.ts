export type ApiProxyMode = "tunnel" | "sslip";

export interface ApiProxyConfig {
  mode: ApiProxyMode;
  fetchUrl: string;
  /** Host header for sslip mode only */
  originHost?: string;
}

const DEFAULT_ORIGIN_IP = "47.100.5.7";

export function parseHttpsOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

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

function buildUpstreamPath(requestUrl: URL, pathParam: string | string[] | undefined): string {
  const suffix = Array.isArray(pathParam) ? pathParam.join("/") : pathParam ?? "";
  return suffix ? `/api/${suffix}${requestUrl.search}` : `/api${requestUrl.search}`;
}

export function buildApiProxyConfig(
  requestUrl: URL,
  pathParam: string | string[] | undefined,
  env: { API_UPSTREAM_HOST?: string; API_ORIGIN_HOST?: string; API_ORIGIN?: string } = {}
): ApiProxyConfig {
  const upstreamPath = buildUpstreamPath(requestUrl, pathParam);
  const tunnelOrigin = parseHttpsOrigin(env.API_ORIGIN);
  if (tunnelOrigin) {
    return { mode: "tunnel", fetchUrl: new URL(upstreamPath, `${tunnelOrigin}/`).toString() };
  }

  const originHost = env.API_ORIGIN_HOST ?? parseIpv4Origin(env.API_ORIGIN) ?? DEFAULT_ORIGIN_IP;
  const upstreamHost = env.API_UPSTREAM_HOST ?? upstreamHostForIp(originHost);
  return {
    mode: "sslip",
    fetchUrl: new URL(upstreamPath, `http://${upstreamHost}/`).toString(),
    originHost
  };
}
