import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../app";
import {
  FREE_QUERY_LIMIT,
  PRO_BUDGET_LIMIT_MICROS,
  PRO_QUERY_LIMIT,
  normalizeCanonicalEmail,
  resetBillingStoreForTests,
  updateSubscription,
} from "../lib/billing";

let server: Server;
let baseUrl: string;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  resetBillingStoreForTests();
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_PRO_PRICE_ID;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.SUPABASE_JWT_SECRET;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockProvider(payload: unknown, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.startsWith(baseUrl)) return realFetch(input, init);
    return status === 200 ? Response.json(payload) : new Response(JSON.stringify(payload), { status });
  });
}

function createSignedJwt(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

function signStripeWebhook(rawBody: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const sig = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

describe("Billing & Subscription Quota Pipeline", () => {
  it("returns unauthenticated Free tier defaults when no token is provided", async () => {
    const res = await realFetch(`${baseUrl}/api/billing/status`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      authenticated: false,
      plan: "free",
      queriesUsed: 0,
      queriesLimit: FREE_QUERY_LIMIT,
      remaining: FREE_QUERY_LIMIT,
    });
  });

  it("authenticates users via signed JWT and tracks Free tier server-key usage", async () => {
    process.env.SUPABASE_JWT_SECRET = "super-secret-jwt-key";
    process.env.GEMINI_API_KEY = "server-gemini-key";

    const token = createSignedJwt(
      {
        sub: "user-jwt-123",
        email: "student@example.edu",
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      "super-secret-jwt-key",
    );

    mockProvider({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  title: "Binary Search",
                  answerMarkdown: "Halves the search space.",
                  terms: [],
                  sourceRefs: [],
                }),
              },
            ],
          },
        },
      ],
    });

    const explainRes = await realFetch(`${baseUrl}/api/study/explain`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        prompt: "Explain binary search",
        sources: [],
        model: "gemini-3.8-flash",
      }),
    });

    const explainBody = (await explainRes.json()) as { title: string };
    expect(explainBody.title).toBe("Binary Search");

    const statusRes = await realFetch(`${baseUrl}/api/billing/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const statusBody = await statusRes.json();
    expect(statusBody).toMatchObject({
      authenticated: true,
      userId: "user-jwt-123",
      email: "student@example.edu",
      plan: "free",
      queriesUsed: 1,
      queriesLimit: FREE_QUERY_LIMIT,
      remaining: FREE_QUERY_LIMIT - 1,
    });
  });

  it("does not deduct quota when an upstream LLM call fails", async () => {
    process.env.GEMINI_API_KEY = "server-gemini-key";
    mockProvider({ error: "upstream error" }, 500);

    const authHeader = { Authorization: "Bearer test-user:user-fail-check:fail@test.com" };
    const explainRes = await realFetch(`${baseUrl}/api/study/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ prompt: "What is a heap?", sources: [], model: "gemini-3.8-flash" }),
    });

    const explainBody = (await explainRes.json()) as { title: string };
    expect(explainBody.title).toBe("Unable to Complete Request");

    const statusRes = await realFetch(`${baseUrl}/api/billing/status`, { headers: authHeader });
    const statusBody = (await statusRes.json()) as { queriesUsed: number };
    expect(statusBody.queriesUsed).toBe(0);
  });

  it("gates Pro-only models on the Free tier unless a BYOK key is provided", async () => {
    process.env.OPENAI_API_KEY = "server-openai-key";
    const authHeader = { Authorization: "Bearer test-user:user-free-gate:free@test.com" };

    // 1. Free user without BYOK tries to use gpt-6-luna -> gated
    const gatedRes = await realFetch(`${baseUrl}/api/study/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ prompt: "Explain dynamic programming", sources: [], model: "gpt-6-luna" }),
    });
    const gatedBody = (await gatedRes.json()) as { title: string; answerMarkdown: string };
    expect(gatedBody.title).toBe("Pro Plan or API Key Required");
    expect(gatedBody.answerMarkdown).toContain("Plan & Usage");
    expect(gatedBody.answerMarkdown).toContain("API Key Settings");

    // 2. Same Free user supplies their own x-openai-api-key (BYOK) -> allowed with 0 quota used
    mockProvider({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: "Dynamic Programming",
              answerMarkdown: "Optimal substructure.",
              terms: [],
              sourceRefs: [],
            }),
          },
        },
      ],
    });

    const byokRes = await realFetch(`${baseUrl}/api/study/explain`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader,
        "x-openai-api-key": "sk-user-personal-key",
      },
      body: JSON.stringify({ prompt: "Explain dynamic programming", sources: [], model: "gpt-6-luna" }),
    });
    const byokBody = (await byokRes.json()) as { title: string };
    expect(byokBody.title).toBe("Dynamic Programming");

    const statusRes = await realFetch(`${baseUrl}/api/billing/status`, { headers: authHeader });
    const statusBody = (await statusRes.json()) as { queriesUsed: number };
    expect(statusBody.queriesUsed).toBe(0);
  });

  it("enforces the 15-question Free limit and unlocks 250 questions across all models on upgrade", async () => {
    process.env.GEMINI_API_KEY = "server-gemini-key";
    process.env.OPENAI_API_KEY = "server-openai-key";
    const userId = "user-limit-test";
    const authHeader = { Authorization: `Bearer test-user:${userId}:limit@test.com` };

    // Set user at 15/15 used
    await updateSubscription(userId, { queriesUsed: FREE_QUERY_LIMIT, queriesLimit: FREE_QUERY_LIMIT });

    const limitRes = await realFetch(`${baseUrl}/api/study/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ prompt: "16th question", sources: [], model: "gemini-3.8-flash" }),
    });
    const limitBody = (await limitRes.json()) as { title: string; answerMarkdown: string };
    expect(limitBody.title).toBe("Free Limit Reached");
    expect(limitBody.answerMarkdown).toContain("Plan & Usage");

    // Upgrade via Demo Checkout (when Stripe env vars are not set)
    const checkoutRes = await realFetch(`${baseUrl}/api/billing/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({}),
    });
    expect(checkoutRes.status).toBe(200);
    const checkoutBody = (await checkoutRes.json()) as { mode: string; subscription: { plan: string; queriesLimit: number } };
    expect(checkoutBody.mode).toBe("demo");
    expect(checkoutBody.subscription.plan).toBe("pro");
    expect(checkoutBody.subscription.queriesLimit).toBe(PRO_QUERY_LIMIT);

    // Pro user can now use OpenAI server key and token cost is tracked against the $10.00 pool
    mockProvider({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: "Pro Answer",
              answerMarkdown: "Unlocked via Pro plan.",
              terms: [],
              sourceRefs: [],
            }),
          },
        },
      ],
      usage: {
        prompt_tokens: 2000,
        completion_tokens: 1000,
      },
    });

    const proExplainRes = await realFetch(`${baseUrl}/api/study/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ prompt: "Pro question", sources: [], model: "gpt-6-luna" }),
    });
    const proExplainBody = (await proExplainRes.json()) as { title: string };
    expect(proExplainBody.title).toBe("Pro Answer");

    const proStatusRes = await realFetch(`${baseUrl}/api/billing/status`, { headers: authHeader });
    const proStatusBody = (await proStatusRes.json()) as {
      budgetUsedMicros: number;
      budgetLimitMicros: number;
      usagePercent: number;
    };
    // gpt-6-luna: 2000 * $0.25/1M + 1000 * $1.00/1M = 500 + 1000 = 1500 micro-dollars ($0.0015)
    expect(proStatusBody.budgetUsedMicros).toBe(1500);
    expect(proStatusBody.budgetLimitMicros).toBe(PRO_BUDGET_LIMIT_MICROS);
    expect(proStatusBody.usagePercent).toBe(1);

    // Exhaust the $10.00 Pro API budget and verify it blocks further server-key requests
    await updateSubscription(userId, { budgetUsedMicros: PRO_BUDGET_LIMIT_MICROS });
    const proCapRes = await realFetch(`${baseUrl}/api/study/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ prompt: "Over $10 budget", sources: [], model: "gpt-6-luna" }),
    });
    const proCapBody = (await proCapRes.json()) as { title: string; answerMarkdown: string };
    expect(proCapBody.title).toBe("Monthly Pro Limit Reached");
    expect(proCapBody.answerMarkdown).toContain("100%");
  });

  it("verifies Stripe webhook HMAC-SHA256 signatures, blocks replays/tampering, and processes events idempotently", async () => {
    const webhookSecret = "whsec_test_secret_12345";
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;

    const eventPayload = {
      id: "evt_checkout_001",
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "user-stripe-99",
          customer: "cus_stripe_99",
          subscription: "sub_stripe_99",
        },
      },
    };
    const rawBody = JSON.stringify(eventPayload);

    // 1. Tampered signature is rejected with 400
    const badRes = await realFetch(`${baseUrl}/api/billing/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": "t=1700000000,v1=deadbeef",
      },
      body: rawBody,
    });
    expect(badRes.status).toBe(400);

    // 2. Expired timestamp (> 5 min old) is rejected with 400
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
    const expiredSig = signStripeWebhook(rawBody, webhookSecret, oldTimestamp);
    const expiredRes = await realFetch(`${baseUrl}/api/billing/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": expiredSig,
      },
      body: rawBody,
    });
    expect(expiredRes.status).toBe(400);

    // 3. Valid signature upgrades user to Pro
    const validSig = signStripeWebhook(rawBody, webhookSecret);
    const validRes = await realFetch(`${baseUrl}/api/billing/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": validSig,
      },
      body: rawBody,
    });
    expect(validRes.status).toBe(200);
    expect(await validRes.json()).toEqual({ received: true, processed: true, duplicate: false });

    const statusRes = await realFetch(`${baseUrl}/api/billing/status`, {
      headers: { Authorization: "Bearer test-user:user-stripe-99" },
    });
    const statusBody = await statusRes.json();
    expect(statusBody).toMatchObject({
      plan: "pro",
      queriesLimit: PRO_QUERY_LIMIT,
    });

    // 4. Duplicate webhook delivery with same event ID is ignored idempotently
    const dupRes = await realFetch(`${baseUrl}/api/billing/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": validSig,
      },
      body: rawBody,
    });
    expect(dupRes.status).toBe(200);
    expect(await dupRes.json()).toEqual({ received: true, processed: false, duplicate: true });

    // 5. Subscription deletion webhook downgrades user back to Free
    const deleteEvent = {
      id: "evt_sub_deleted_002",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_stripe_99",
          customer: "cus_stripe_99",
        },
      },
    };
    const deleteRaw = JSON.stringify(deleteEvent);
    const deleteRes = await realFetch(`${baseUrl}/api/billing/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": signStripeWebhook(deleteRaw, webhookSecret),
      },
      body: deleteRaw,
    });
    expect(deleteRes.status).toBe(200);

    const afterDeleteStatus = await realFetch(`${baseUrl}/api/billing/status`, {
      headers: { Authorization: "Bearer test-user:user-stripe-99" },
    });
    expect(await afterDeleteStatus.json()).toMatchObject({
      plan: "free",
      queriesLimit: FREE_QUERY_LIMIT,
    });
  });

  it("strips +aliases and Gmail dots to prevent farming extra free allowances", async () => {
    expect(normalizeCanonicalEmail("St.Udent+1@gmail.com")).toBe("student@gmail.com");
    expect(normalizeCanonicalEmail("user+promo@outlook.com")).toBe("user@outlook.com");

    const firstRes = await realFetch(`${baseUrl}/api/billing/status`, {
      headers: { Authorization: "Bearer test-user:user-orig-1:St.Udent@gmail.com" },
    });
    const firstBody = (await firstRes.json()) as { queriesLimit: number; remaining: number };
    expect(firstBody.queriesLimit).toBe(FREE_QUERY_LIMIT);
    expect(firstBody.remaining).toBe(FREE_QUERY_LIMIT);

    // Second account using +alias and dot variant of the same Gmail inbox gets 0 free allowance
    const aliasRes = await realFetch(`${baseUrl}/api/billing/status`, {
      headers: { Authorization: "Bearer test-user:user-alias-2:student+free2@gmail.com" },
    });
    const aliasBody = (await aliasRes.json()) as { queriesLimit: number; remaining: number };
    expect(aliasBody.queriesLimit).toBe(0);
    expect(aliasBody.remaining).toBe(0);
  });
});
