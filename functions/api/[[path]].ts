import { buildApiProxyConfig, buildOriginFetchUrl } from "./proxy";

export const onRequest: PagesFunction<{ API_RESOLVE_IP?: string; API_ORIGIN_HOST?: string; API_ORIGIN?: string }> = async (context) => {
  const config = buildApiProxyConfig(new URL(context.request.url), context.params.path, context.env);
  const targetUrl = buildOriginFetchUrl(config);

  const headers = new Headers(context.request.headers);
  headers.set("host", config.originHost);

  const init: RequestInit & { cf?: { resolveOverride: string } } = {
    method: context.request.method,
    headers,
    redirect: "manual",
    cf: { resolveOverride: config.resolveIp }
  };
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    init.body = context.request.body;
  }

  try {
    const response = await fetch(targetUrl, init);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "API proxy failed";
    return Response.json({ error: message }, { status: 502 });
  }
};
