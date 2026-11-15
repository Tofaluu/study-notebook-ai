interface Env {
  HEALTHZ_URL: string;
}

interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void;
}

const GATEWAY_WAKEUP_STATUSES = new Set([502, 503, 504]);

async function pingHealthz(url: string): Promise<number> {
  const res = await fetch(url, {
    method: "GET",
    headers: { "User-Agent": "study-notebook-keepalive/1.0" },
    signal: AbortSignal.timeout(25_000),
  });
  await res.body?.cancel();
  return res.status;
}

async function ensureBackendAwake(url: string): Promise<number> {
  const status = await pingHealthz(url);
  if (!GATEWAY_WAKEUP_STATUSES.has(status)) {
    return status;
  }

  // If Render had just restarted, give it one follow-up ping after 12s so it finishes booting
  await new Promise((resolve) => setTimeout(resolve, 12_000));
  return pingHealthz(url);
}

export default {
  async scheduled(_controller: unknown, env: Env, ctx: WorkerContext): Promise<void> {
    ctx.waitUntil(
      ensureBackendAwake(env.HEALTHZ_URL).catch((err) => {
        console.error("Keepalive ping failed:", err);
      }),
    );
  },

  async fetch(_request: Request, env: Env): Promise<Response> {
    try {
      const upstreamStatus = await pingHealthz(env.HEALTHZ_URL);
      return Response.json(
        { ok: upstreamStatus >= 200 && upstreamStatus < 400, target: env.HEALTHZ_URL, upstreamStatus },
        { status: upstreamStatus >= 200 && upstreamStatus < 400 ? 200 : 502 },
      );
    } catch (err) {
      return Response.json(
        { ok: false, target: env.HEALTHZ_URL, error: err instanceof Error ? err.message : String(err) },
        { status: 502 },
      );
    }
  },
};
