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

  let res = await fetch(targetUrl, {
    method,
    headers,
    body: hasBody ? context.request.body : undefined,
    redirect: "manual",
  });

  // Render Free can briefly return a 502/503 HTML page while spinning up from sleep;
  // convert HTML gateway errors into clean JSON so the UI never displays raw HTML.
  const contentType = res.headers.get("content-type") || "";
  if ((res.status === 502 || res.status === 503 || res.status === 504) && contentType.includes("text/html")) {
    return new Response(
      JSON.stringify({
        error: "The study server is waking up from sleep. Wait a few seconds and click Try again.",
      }),
      {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return res;
};
