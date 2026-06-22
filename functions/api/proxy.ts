export function buildApiProxyTarget(origin: string, requestUrl: URL, pathParam: string | string[] | undefined): string {
  const suffix = Array.isArray(pathParam) ? pathParam.join("/") : pathParam ?? "";
  const path = suffix ? `/api/${suffix}` : "/api";
  return `${origin.replace(/\/$/, "")}${path}${requestUrl.search}`;
}
