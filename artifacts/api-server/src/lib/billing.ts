import crypto from "node:crypto";
import type { Request } from "express";
import type { ProviderAdapter, TokenUsage } from "../llm/types";

export type ProviderId = ProviderAdapter["id"];

export const FREE_QUERY_LIMIT = 15;
export const PRO_QUERY_LIMIT = 250;
export const PRO_PRICE_MONTHLY_USD = 8;
export const PRO_BUDGET_LIMIT_USD = 10;
/** $10.00 total monthly API budget across Google, OpenAI, and Anthropic, stored in micro-dollars ($0.000001). */
export const PRO_BUDGET_LIMIT_MICROS = 10_000_000;

/**
 * Per-1M-token wholesale API rates in USD (1 token = rate micro-dollars).
 */
export const MODEL_TOKEN_RATES_USD_PER_1M: Record<string, { input: number; output: number }> = {
  "gemini-3.1-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-3.8-flash": { input: 0.15, output: 0.6 },
  "gemini-3.1-pro-preview": { input: 1.25, output: 5.0 },
  "gpt-6-luna": { input: 0.25, output: 1.0 },
  "gpt-6.1-sol": { input: 2.5, output: 10.0 },
  "claude-haiku-4-5": { input: 0.8, output: 4.0 },
  "claude-sonnet-5-5": { input: 3.0, output: 15.0 },
  "claude-opus-5-5": { input: 15.0, output: 75.0 },
  "claude-fable-5-1": { input: 15.0, output: 75.0 },
};

export function calculateTokenCostMicros(model: string, usage?: TokenUsage): number {
  const rate = MODEL_TOKEN_RATES_USD_PER_1M[model] ?? { input: 1.0, output: 4.0 };
  const inputTokens = Math.max(0, usage?.inputTokens ?? 500);
  const outputTokens = Math.max(0, usage?.outputTokens ?? 500);
  return Math.max(1, Math.ceil(inputTokens * rate.input + outputTokens * rate.output));
}

export const FREE_ELIGIBLE_MODELS: ReadonlySet<string> = new Set<string>([
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
]);

export type SubscriptionPlan = "free" | "pro";

export interface AuthenticatedUser {
  id: string;
  email?: string;
}

export interface UserSubscription {
  userId: string;
  email?: string;
  plan: SubscriptionPlan;
  queriesUsed: number;
  queriesLimit: number;
  budgetUsedMicros: number;
  budgetLimitMicros: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  updatedAt: string;
}

export interface BillingStatusResponse {
  authenticated: boolean;
  userId: string | null;
  email: string | null;
  plan: SubscriptionPlan;
  queriesUsed: number;
  queriesLimit: number;
  budgetUsedMicros: number;
  budgetLimitMicros: number;
  usagePercent: number;
  remaining: number;
  currentPeriodEnd: string | null;
  freeEligibleModels: string[];
  stripeConfigured: boolean;
  serverKeysConfigured: {
    gemini: boolean;
    openai: boolean;
    anthropic: boolean;
  };
}

// In-memory store for local dev / automated tests when SUPABASE_SERVICE_ROLE_KEY is not set
const memorySubscriptions = new Map<string, UserSubscription>();
const processedWebhookEvents = new Set<string>();

export function resetBillingStoreForTests(): void {
  memorySubscriptions.clear();
  processedWebhookEvents.clear();
}

export function isFreeEligibleModel(model: string): boolean {
  return FREE_ELIGIBLE_MODELS.has(model);
}

export function getServerApiKey(providerId: ProviderId): string | undefined {
  switch (providerId) {
    case "gemini":
      return process.env.GEMINI_API_KEY?.trim() || undefined;
    case "openai":
      return process.env.OPENAI_API_KEY?.trim() || undefined;
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY?.trim() || undefined;
  }
}

export function getServerKeysConfigured(): { gemini: boolean; openai: boolean; anthropic: boolean } {
  return {
    gemini: Boolean(getServerApiKey("gemini")),
    openai: Boolean(getServerApiKey("openai")),
    anthropic: Boolean(getServerApiKey("anthropic")),
  };
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_PRO_PRICE_ID?.trim());
}

function decodeBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, "base64");
}

/**
 * Extracts and validates the authenticated user from the `Authorization: Bearer <token>` header.
 * Supports:
 * 1. Verified JWTs (verifies HMAC-SHA256 signature when SUPABASE_JWT_SECRET is set, plus `exp` and `sub`).
 * 2. `test-user:<id>[:<email>]` tokens in non-production environments for integration tests.
 */
export function resolveAuthenticatedUser(req: Request): AuthenticatedUser | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== "string") return null;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  if (!token) return null;

  if (process.env.NODE_ENV !== "production" && token.startsWith("test-user:")) {
    const parts = token.split(":");
    const id = parts[1]?.trim();
    const email = parts[2]?.trim();
    if (!id) return null;
    return { id, email };
  }

  const segments = token.split(".");
  if (segments.length !== 3) return null;

  try {
    const [headerB64, payloadB64, signatureB64] = segments;
    const jwtSecret = process.env.SUPABASE_JWT_SECRET?.trim();

    if (jwtSecret) {
      const expectedSig = crypto
        .createHmac("sha256", jwtSecret)
        .update(`${headerB64}.${payloadB64}`)
        .digest();
      const actualSig = decodeBase64Url(signatureB64);
      if (expectedSig.length !== actualSig.length || !crypto.timingSafeEqual(expectedSig, actualSig)) {
        return null;
      }
    }

    const payloadJson = decodeBase64Url(payloadB64).toString("utf8");
    const payload = JSON.parse(payloadJson) as {
      sub?: string;
      email?: string;
      exp?: number;
    };

    if (!payload.sub || typeof payload.sub !== "string") return null;

    if (typeof payload.exp === "number") {
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (payload.exp < nowSeconds) return null;
    }

    return {
      id: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
    };
  } catch {
    return null;
  }
}

function getSupabaseRestConfig(): { url: string; serviceKey: string; headers: Record<string, string> } | null {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return null;
  const headers: Record<string, string> = {
    apikey: serviceKey,
  };
  // Legacy service_role keys are 3-part JWTs; new sb_secret_... keys are exchanged by the Supabase gateway via apikey header alone
  if (!serviceKey.startsWith("sb_secret_")) {
    headers.Authorization = `Bearer ${serviceKey}`;
  }
  return { url: url.replace(/\/+$/, ""), serviceKey, headers };
}

function createDefaultSubscription(userId: string, email?: string): UserSubscription {
  return {
    userId,
    email,
    plan: "free",
    queriesUsed: 0,
    queriesLimit: FREE_QUERY_LIMIT,
    budgetUsedMicros: 0,
    budgetLimitMicros: PRO_BUDGET_LIMIT_MICROS,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    currentPeriodEnd: null,
    updatedAt: new Date().toISOString(),
  };
}

function mapRowToSubscription(row: Record<string, unknown>, fallbackUserId: string): UserSubscription {
  const plan = row.plan === "pro" ? "pro" : "free";
  return {
    userId: typeof row.user_id === "string" ? row.user_id : fallbackUserId,
    email: typeof row.email === "string" ? row.email : undefined,
    plan,
    queriesUsed: typeof row.queries_used === "number" ? row.queries_used : 0,
    queriesLimit:
      typeof row.queries_limit === "number"
        ? row.queries_limit
        : plan === "pro"
          ? PRO_QUERY_LIMIT
          : FREE_QUERY_LIMIT,
    budgetUsedMicros: typeof row.budget_used_micros === "number" ? row.budget_used_micros : 0,
    budgetLimitMicros:
      typeof row.budget_limit_micros === "number" && row.budget_limit_micros > 0
        ? row.budget_limit_micros
        : PRO_BUDGET_LIMIT_MICROS,
    stripeCustomerId: typeof row.stripe_customer_id === "string" ? row.stripe_customer_id : null,
    stripeSubscriptionId: typeof row.stripe_subscription_id === "string" ? row.stripe_subscription_id : null,
    currentPeriodEnd: typeof row.current_period_end === "string" ? row.current_period_end : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
  };
}

export async function getSubscription(userId: string, email?: string): Promise<UserSubscription> {
  const supabaseConfig = getSupabaseRestConfig();
  if (supabaseConfig) {
    try {
      const res = await fetch(
        `${supabaseConfig.url}/rest/v1/user_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=*`,
        {
          headers: supabaseConfig.headers,
        },
      );
      if (res.ok) {
        const rows = (await res.json()) as Array<Record<string, unknown>>;
        if (rows.length > 0) {
          const sub = mapRowToSubscription(rows[0], userId);
          memorySubscriptions.set(userId, sub);
          return sub;
        }
      }
    } catch {
      // Fall back to in-memory store if network call fails
    }
  }

  const existing = memorySubscriptions.get(userId);
  if (existing) {
    if (email && !existing.email) existing.email = email;
    return existing;
  }

  const created = createDefaultSubscription(userId, email);
  memorySubscriptions.set(userId, created);
  return created;
}

export async function updateSubscription(
  userId: string,
  patch: Partial<Omit<UserSubscription, "userId" | "updatedAt">>,
): Promise<UserSubscription> {
  const current = await getSubscription(userId, patch.email);
  const updated: UserSubscription = {
    ...current,
    ...patch,
    userId,
    updatedAt: new Date().toISOString(),
  };
  memorySubscriptions.set(userId, updated);

  const supabaseConfig = getSupabaseRestConfig();
  if (supabaseConfig) {
    try {
      await fetch(`${supabaseConfig.url}/rest/v1/user_subscriptions`, {
        method: "POST",
        headers: {
          ...supabaseConfig.headers,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          user_id: updated.userId,
          email: updated.email ?? null,
          plan: updated.plan,
          queries_used: updated.queriesUsed,
          queries_limit: updated.queriesLimit,
          budget_used_micros: updated.budgetUsedMicros,
          budget_limit_micros: updated.budgetLimitMicros,
          stripe_customer_id: updated.stripeCustomerId,
          stripe_subscription_id: updated.stripeSubscriptionId,
          current_period_end: updated.currentPeriodEnd,
          updated_at: updated.updatedAt,
        }),
      });
    } catch {
      // Keep in-memory state if Supabase is unreachable
    }
  }

  return updated;
}

export async function findSubscriptionByStripeCustomer(
  stripeCustomerId: string,
  stripeSubscriptionId?: string | null,
): Promise<UserSubscription | null> {
  for (const sub of memorySubscriptions.values()) {
    if (sub.stripeCustomerId === stripeCustomerId) return sub;
    if (stripeSubscriptionId && sub.stripeSubscriptionId === stripeSubscriptionId) return sub;
  }

  const supabaseConfig = getSupabaseRestConfig();
  if (supabaseConfig) {
    try {
      const res = await fetch(
        `${supabaseConfig.url}/rest/v1/user_subscriptions?stripe_customer_id=eq.${encodeURIComponent(stripeCustomerId)}&select=*`,
        {
          headers: supabaseConfig.headers,
        },
      );
      if (res.ok) {
        const rows = (await res.json()) as Array<Record<string, unknown>>;
        if (rows.length > 0 && typeof rows[0].user_id === "string") {
          const sub = mapRowToSubscription(rows[0], rows[0].user_id);
          memorySubscriptions.set(sub.userId, sub);
          return sub;
        }
      }
    } catch {
      // Ignore network errors
    }
  }

  return null;
}

export async function incrementQuotaUsage(
  userId: string,
  model?: string,
  usage?: TokenUsage,
): Promise<UserSubscription> {
  const current = await getSubscription(userId);
  const costMicros = model ? calculateTokenCostMicros(model, usage) : 0;
  return updateSubscription(userId, {
    queriesUsed: current.queriesUsed + 1,
    budgetUsedMicros: current.budgetUsedMicros + costMicros,
  });
}

export function computeUsagePercent(sub: UserSubscription): number {
  if (sub.plan === "pro") {
    if (sub.budgetUsedMicros <= 0) return 0;
    if (sub.budgetUsedMicros >= sub.budgetLimitMicros) return 100;
    return Math.min(99, Math.max(1, Math.round((sub.budgetUsedMicros / Math.max(1, sub.budgetLimitMicros)) * 100)));
  }
  if (sub.queriesUsed <= 0) return 0;
  if (sub.queriesUsed >= sub.queriesLimit) return 100;
  return Math.min(99, Math.max(1, Math.round((sub.queriesUsed / Math.max(1, sub.queriesLimit)) * 100)));
}

export async function getBillingStatus(req: Request): Promise<BillingStatusResponse> {
  const user = resolveAuthenticatedUser(req);
  const freeEligibleModels = Array.from(FREE_ELIGIBLE_MODELS);
  const stripeConfigured = isStripeConfigured();
  const serverKeysConfigured = getServerKeysConfigured();

  if (!user) {
    return {
      authenticated: false,
      userId: null,
      email: null,
      plan: "free",
      queriesUsed: 0,
      queriesLimit: FREE_QUERY_LIMIT,
      budgetUsedMicros: 0,
      budgetLimitMicros: PRO_BUDGET_LIMIT_MICROS,
      usagePercent: 0,
      remaining: FREE_QUERY_LIMIT,
      currentPeriodEnd: null,
      freeEligibleModels,
      stripeConfigured,
      serverKeysConfigured,
    };
  }

  const sub = await getSubscription(user.id, user.email);
  const usagePercent = computeUsagePercent(sub);
  const remaining =
    sub.plan === "pro"
      ? Math.max(0, 100 - usagePercent)
      : Math.max(0, sub.queriesLimit - sub.queriesUsed);

  return {
    authenticated: true,
    userId: sub.userId,
    email: sub.email ?? null,
    plan: sub.plan,
    queriesUsed: sub.queriesUsed,
    queriesLimit: sub.queriesLimit,
    budgetUsedMicros: sub.budgetUsedMicros,
    budgetLimitMicros: sub.budgetLimitMicros,
    usagePercent,
    remaining,
    currentPeriodEnd: sub.currentPeriodEnd,
    freeEligibleModels,
    stripeConfigured,
    serverKeysConfigured,
  };
}

export type ExecutionAccessResult =
  | {
      allowed: true;
      apiKey: string;
      mode: "byok" | "server_quota";
      consumeQuota: (usage?: TokenUsage) => Promise<void>;
    }
  | {
      allowed: false;
      reason: "missing_key" | "pro_model_required" | "quota_exceeded";
      subscription?: UserSubscription;
    };

/**
 * Resolves whether a study explanation request can proceed:
 * 1. If the user supplied a BYOK header (`x-gemini-api-key`, `x-openai-api-key`, `x-anthropic-api-key`),
 *    use it directly with zero quota impact.
 * 2. Otherwise, if the user is signed in, check their subscription plan (`free` vs `pro`),
 *    model eligibility, remaining quota, and server-side API key availability.
 */
export async function resolveExecutionAccess(params: {
  req: Request;
  model: string;
  provider: ProviderId;
  userProvidedKey?: string;
}): Promise<ExecutionAccessResult> {
  const { req, model, provider, userProvidedKey } = params;

  // 1. BYOK always takes priority and never consumes server quota
  if (userProvidedKey && userProvidedKey.trim()) {
    return {
      allowed: true,
      apiKey: userProvidedKey.trim(),
      mode: "byok",
      consumeQuota: async () => {},
    };
  }

  // 2. Check if user is signed in
  const user = resolveAuthenticatedUser(req);
  if (!user) {
    return { allowed: false, reason: "missing_key" };
  }

  const subscription = await getSubscription(user.id, user.email);

  // 3. Check model eligibility on the Free plan
  if (subscription.plan === "free" && !isFreeEligibleModel(model)) {
    return {
      allowed: false,
      reason: "pro_model_required",
      subscription,
    };
  }

  // 4. Check remaining quota on the user's current plan:
  //    - Free tier: 15 free questions cap (queriesUsed >= queriesLimit)
  //    - Pro tier: $10.00 total monthly API budget across all 3 providers (budgetUsedMicros >= budgetLimitMicros)
  const isQuotaExceeded =
    subscription.plan === "pro"
      ? subscription.budgetUsedMicros >= subscription.budgetLimitMicros
      : subscription.queriesUsed >= subscription.queriesLimit;

  if (isQuotaExceeded) {
    return {
      allowed: false,
      reason: "quota_exceeded",
      subscription,
    };
  }

  // 5. Resolve server-side API key for the requested provider
  const serverKey = getServerApiKey(provider);
  if (!serverKey) {
    return { allowed: false, reason: "missing_key", subscription };
  }

  return {
    allowed: true,
    apiKey: serverKey,
    mode: "server_quota",
    consumeQuota: async (usage?: TokenUsage) => {
      await incrementQuotaUsage(user.id, model, usage);
    },
  };
}

/**
 * Verifies a Stripe webhook `Stripe-Signature` header (`t=...,v1=...`) using HMAC-SHA256
 * and timing-safe comparison, rejecting payloads outside the replay tolerance window.
 */
export function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  webhookSecret: string,
  toleranceSeconds = 300,
): boolean {
  if (!signatureHeader || !webhookSecret) return false;

  const parts = signatureHeader.split(",").map((part) => part.trim());
  const timestampPart = parts.find((part) => part.startsWith("t="));
  const v1Signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3))
    .filter(Boolean);

  if (!timestampPart || v1Signatures.length === 0) return false;

  const timestamp = Number(timestampPart.slice(2));
  if (!Number.isFinite(timestamp) || timestamp <= 0) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedHex = crypto
    .createHmac("sha256", webhookSecret)
    .update(signedPayload, "utf8")
    .digest("hex");
  const expectedBuf = Buffer.from(expectedHex, "utf8");

  return v1Signatures.some((sig) => {
    const actualBuf = Buffer.from(sig, "utf8");
    return expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);
  });
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, any>;
  };
}

/**
 * Processes verified Stripe webhook events idempotently.
 */
export async function processStripeWebhookEvent(
  event: StripeWebhookEvent,
): Promise<{ processed: boolean; duplicate: boolean }> {
  if (!event?.id || !event?.type) {
    throw new Error("Invalid Stripe event payload");
  }

  if (processedWebhookEvents.has(event.id)) {
    return { processed: false, duplicate: true };
  }
  processedWebhookEvents.add(event.id);

  const obj = event.data?.object ?? {};

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      // Gate fulfillment on payment_status when present (async payment methods may complete as "unpaid" first)
      if (event.type === "checkout.session.completed" && obj.payment_status === "unpaid") {
        break;
      }
      const userId =
        (typeof obj.client_reference_id === "string" && obj.client_reference_id) ||
        (typeof obj.metadata?.userId === "string" && obj.metadata.userId);
      if (userId) {
        const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await updateSubscription(userId, {
          plan: "pro",
          queriesLimit: PRO_QUERY_LIMIT,
          stripeCustomerId: typeof obj.customer === "string" ? obj.customer : null,
          stripeSubscriptionId: typeof obj.subscription === "string" ? obj.subscription : null,
          currentPeriodEnd: periodEnd,
        });
      }
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const customerId = typeof obj.customer === "string" ? obj.customer : "";
      const subscriptionId = typeof obj.id === "string" ? obj.id : null;
      const userIdFromMeta = typeof obj.metadata?.userId === "string" ? obj.metadata.userId : null;
      // Resolve via Stripe object graph (customer/subscription) first, metadata as explicit fallback
      const target =
        (customerId ? await findSubscriptionByStripeCustomer(customerId, subscriptionId) : null) ??
        (userIdFromMeta ? await getSubscription(userIdFromMeta) : null);

      if (target) {
        const status = typeof obj.status === "string" ? obj.status : "";
        const isActive = status === "active" || status === "trialing";
        const currentPeriodEnd =
          typeof obj.current_period_end === "number"
            ? new Date(obj.current_period_end * 1000).toISOString()
            : target.currentPeriodEnd;

        await updateSubscription(target.userId, {
          plan: isActive ? "pro" : "free",
          queriesLimit: isActive ? PRO_QUERY_LIMIT : FREE_QUERY_LIMIT,
          stripeCustomerId: customerId || target.stripeCustomerId,
          stripeSubscriptionId: subscriptionId ?? target.stripeSubscriptionId,
          currentPeriodEnd,
        });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const customerId = typeof obj.customer === "string" ? obj.customer : "";
      const subscriptionId = typeof obj.id === "string" ? obj.id : null;
      const userIdFromMeta = typeof obj.metadata?.userId === "string" ? obj.metadata.userId : null;
      const target =
        (customerId ? await findSubscriptionByStripeCustomer(customerId, subscriptionId) : null) ??
        (userIdFromMeta ? await getSubscription(userIdFromMeta) : null);

      if (target) {
        await updateSubscription(target.userId, {
          plan: "free",
          queriesLimit: FREE_QUERY_LIMIT,
          stripeSubscriptionId: null,
          currentPeriodEnd: null,
        });
      }
      break;
    }

    case "invoice.paid":
    case "invoice.payment_succeeded": {
      const customerId = typeof obj.customer === "string" ? obj.customer : "";
      const subscriptionId = typeof obj.subscription === "string" ? obj.subscription : null;
      if (customerId) {
        const target = await findSubscriptionByStripeCustomer(customerId, subscriptionId);
        if (target && target.plan === "pro") {
          await updateSubscription(target.userId, {
            queriesUsed: 0,
            queriesLimit: PRO_QUERY_LIMIT,
            budgetUsedMicros: 0,
            budgetLimitMicros: PRO_BUDGET_LIMIT_MICROS,
          });
        }
      }
      break;
    }

    case "invoice.payment_failed":
    case "charge.dispute.created":
    case "charge.refunded":
    case "radar.early_fraud_warning.created": {
      const customerId = typeof obj.customer === "string" ? obj.customer : "";
      const subscriptionId = typeof obj.subscription === "string" ? obj.subscription : null;
      if (customerId) {
        const target = await findSubscriptionByStripeCustomer(customerId, subscriptionId);
        if (target) {
          await updateSubscription(target.userId, {
            plan: "free",
            queriesLimit: FREE_QUERY_LIMIT,
          });
        }
      }
      break;
    }
  }

  return { processed: true, duplicate: false };
}
