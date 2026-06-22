import { buildApiProxyTarget } from "./proxy";

const DEFAULT_API_ORIGIN = "http://8.147.67.18";

export const onRequest: PagesFunction<{ API_ORIGIN?: string }> = async (context) => {
  const origin = context.env.API_ORIGIN ?? DEFAULT_API_ORIGIN;
  const targetUrl = buildApiProxyTarget(origin, new URL(context.request.url), context.params.path);

  const headers = new Headers(context.request.headers);
  headers.delete("host");

  const init: RequestInit = {
    method: context.request.method,
    headers,
    redirect: "manual"
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
