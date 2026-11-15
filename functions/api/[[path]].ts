interface Env {
  API_ORIGIN?: string;
}

/**
 * Proxies `/api/*` requests from Cloudflare Pages (`study.thomasliu.dev`) to the Express backend (`API_ORIGIN`),
 * preserving raw request bytes and headers (including `stripe-signature` and `authorization`).
 */
export const onRequest = async (context: { request: Request; env: Env }): Promise<Response> => {
  const apiOrigin = context.env.API_ORIGIN?.trim()?.replace(/\/+$/, "");
  if (!apiOrigin) {
    return new Response(JSON.stringify({ error: "API_ORIGIN is not configured." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const incomingUrl = new URL(context.request.url);
  const targetUrl = `${apiOrigin}${incomingUrl.pathname}${incomingUrl.search}`;

  const headers = new Headers(context.request.headers);
  headers.delete("host");

  const method = context.request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";

  return fetch(targetUrl, {
    method,
    headers,
    body: hasBody ? context.request.body : undefined,
    redirect: "manual",
  });
};
