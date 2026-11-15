import { Router, type IRouter, type Request } from "express";
import {
  FREE_QUERY_LIMIT,
  PRO_BUDGET_LIMIT_MICROS,
  PRO_QUERY_LIMIT,
  getBillingStatus,
  getSubscription,
  isStripeConfigured,
  processStripeWebhookEvent,
  resolveAuthenticatedUser,
  updateSubscription,
  verifyStripeWebhookSignature,
  type StripeWebhookEvent,
} from "../lib/billing";

const router: IRouter = Router();

function resolveSafeReturnOrigin(req: Request): string {
  const allowedOrigins = new Set<string>(["http://localhost:5173", "http://127.0.0.1:5173"]);
  if (typeof req.headers.origin === "string" && req.headers.origin.trim()) {
    allowedOrigins.add(req.headers.origin.trim().replace(/\/+$/, ""));
  }
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) {
    try {
      allowedOrigins.add(new URL(appUrl).origin);
    } catch {
      // Ignore malformed APP_URL
    }
  }

  const candidate = typeof req.body?.returnUrl === "string" ? req.body.returnUrl.trim() : "";
  if (candidate) {
    try {
      const parsed = new URL(candidate);
      if ((parsed.protocol === "http:" || parsed.protocol === "https:") && allowedOrigins.has(parsed.origin)) {
        return parsed.origin;
      }
    } catch {
      // Fall back to request origin below
    }
  }

  return typeof req.headers.origin === "string" && req.headers.origin.trim()
    ? req.headers.origin.trim().replace(/\/+$/, "")
    : "http://localhost:5173";
}

router.get("/billing/status", async (req, res) => {
  const status = await getBillingStatus(req);
  res.json(status);
});

router.post("/billing/checkout", async (req, res) => {
  const user = await resolveAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Please sign in to upgrade your plan." });
    return;
  }

  const origin = resolveSafeReturnOrigin(req);

  if (isStripeConfigured()) {
    const secretKey = process.env.STRIPE_SECRET_KEY!.trim();
    const priceId = process.env.STRIPE_PRO_PRICE_ID!.trim();
    const sub = await getSubscription(user.id, user.email);

    // Note: Do NOT pass payment_method_types — let Stripe dynamically display eligible payment methods
    const form = new URLSearchParams();
    form.set("mode", "subscription");
    form.set("client_reference_id", user.id);
    form.set("metadata[userId]", user.id);
    form.set("line_items[0][price]", priceId);
    form.set("line_items[0][quantity]", "1");
    form.set(
      "success_url",
      `${origin.replace(/\/+$/, "")}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    );
    form.set("cancel_url", `${origin.replace(/\/+$/, "")}/?billing=cancelled`);

    if (sub.stripeCustomerId && !sub.stripeCustomerId.startsWith("cus_demo_")) {
      form.set("customer", sub.stripeCustomerId);
    } else if (user.email) {
      form.set("customer_email", user.email);
    }

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    if (!stripeRes.ok) {
      const errText = await stripeRes.text();
      res.status(502).json({ error: `Stripe checkout session failed: ${errText.slice(0, 200)}` });
      return;
    }

    const session = (await stripeRes.json()) as { id: string; url?: string };
    res.json({
      mode: "stripe",
      sessionId: session.id,
      url: session.url ?? null,
    });
    return;
  }

  if (process.env.NODE_ENV === "production") {
    res.status(503).json({ error: "Billing is temporarily unavailable." });
    return;
  }

  // Demo Checkout fallback when Stripe keys are not configured in local dev / tests
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const updated = await updateSubscription(user.id, {
    email: user.email,
    plan: "pro",
    queriesUsed: 0,
    queriesLimit: PRO_QUERY_LIMIT,
    budgetUsedMicros: 0,
    budgetLimitMicros: PRO_BUDGET_LIMIT_MICROS,
    stripeCustomerId: `cus_demo_${user.id.slice(0, 8)}`,
    stripeSubscriptionId: `sub_demo_${user.id.slice(0, 8)}`,
    currentPeriodEnd: periodEnd,
  });

  res.json({
    mode: "demo",
    url: null,
    subscription: updated,
  });
});

router.post("/billing/verify-session", async (req, res) => {
  const user = await resolveAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Please sign in to verify your checkout session." });
    return;
  }

  const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId.trim() : "";
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!sessionId || !secretKey) {
    res.status(400).json({ error: "Missing session ID or Stripe configuration." });
    return;
  }

  const stripeRes = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    {
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    },
  );

  if (!stripeRes.ok) {
    res.status(400).json({ error: "Could not verify checkout session with Stripe." });
    return;
  }

  const session = (await stripeRes.json()) as {
    id: string;
    client_reference_id?: string | null;
    metadata?: { userId?: string };
    payment_status?: string;
    status?: string;
    customer?: string | null;
    subscription?: string | null;
  };

  const ownerId = session.client_reference_id || session.metadata?.userId;
  if (ownerId !== user.id) {
    res.status(403).json({ error: "This checkout session belongs to a different user." });
    return;
  }

  if (session.payment_status === "paid" || session.payment_status === "no_payment_required") {
    const updated = await updateSubscription(user.id, {
      email: user.email,
      plan: "pro",
      queriesUsed: 0,
      queriesLimit: PRO_QUERY_LIMIT,
      budgetUsedMicros: 0,
      budgetLimitMicros: PRO_BUDGET_LIMIT_MICROS,
      stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
      stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : null,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    res.json({ verified: true, subscription: updated });
    return;
  }

  res.json({ verified: false });
});

router.post("/billing/portal", async (req, res) => {
  const user = await resolveAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Please sign in to manage your subscription." });
    return;
  }

  const sub = await getSubscription(user.id, user.email);
  const origin = resolveSafeReturnOrigin(req);

  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (secretKey && sub.stripeCustomerId && !sub.stripeCustomerId.startsWith("cus_demo_")) {
    const form = new URLSearchParams();
    form.set("customer", sub.stripeCustomerId);
    form.set("return_url", `${origin.replace(/\/+$/, "")}/?billing=portal`);

    const portalRes = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    if (!portalRes.ok) {
      const errText = await portalRes.text();
      res.status(502).json({ error: `Stripe billing portal failed: ${errText.slice(0, 200)}` });
      return;
    }

    const portal = (await portalRes.json()) as { url: string };
    res.json({
      mode: "stripe",
      url: portal.url,
    });
    return;
  }

  if (process.env.NODE_ENV === "production") {
    res.status(503).json({ error: "Billing portal is temporarily unavailable." });
    return;
  }

  // Demo mode: cancel Pro plan and revert to Free tier
  const updated = await updateSubscription(user.id, {
    plan: "free",
    queriesLimit: FREE_QUERY_LIMIT,
    stripeSubscriptionId: null,
    currentPeriodEnd: null,
  });

  res.json({
    mode: "demo",
    url: null,
    subscription: updated,
  });
});

router.post("/billing/webhook", async (req: Request, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    res.status(400).json({ error: "STRIPE_WEBHOOK_SECRET is not configured." });
    return;
  }

  const signature = req.headers["stripe-signature"];
  const sigHeader = Array.isArray(signature) ? signature[0] : signature;
  const rawBody =
    typeof (req as Request & { rawBody?: string }).rawBody === "string"
      ? (req as Request & { rawBody: string }).rawBody
      : JSON.stringify(req.body ?? {});

  const isValid = verifyStripeWebhookSignature(rawBody, sigHeader, webhookSecret);
  if (!isValid) {
    res.status(400).json({ error: "Invalid Stripe webhook signature." });
    return;
  }

  try {
    const event = (typeof req.body === "object" && req.body !== null
      ? req.body
      : JSON.parse(rawBody)) as StripeWebhookEvent;
    const result = await processStripeWebhookEvent(event);
    res.json({ received: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook processing error";
    res.status(400).json({ error: message });
  }
});

export default router;
