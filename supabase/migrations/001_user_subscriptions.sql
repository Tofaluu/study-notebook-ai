-- Migration: 001_user_subscriptions
-- Description: Subscription tiers, server-key usage quotas, and Stripe webhook idempotency log

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  canonical_email text,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  queries_used integer NOT NULL DEFAULT 0 CHECK (queries_used >= 0),
  queries_limit integer NOT NULL DEFAULT 15 CHECK (queries_limit >= 0),
  budget_used_micros bigint NOT NULL DEFAULT 0 CHECK (budget_used_micros >= 0),
  budget_limit_micros bigint NOT NULL DEFAULT 10000000 CHECK (budget_limit_micros > 0),
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_canonical_email
  ON public.user_subscriptions (canonical_email)
  WHERE canonical_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_customer
  ON public.user_subscriptions (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_subscription
  ON public.user_subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Webhook idempotency table to prevent duplicate Stripe event processing across retries
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscription & usage status directly if needed
CREATE POLICY "Users can read own subscription"
  ON public.user_subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Atomic quota increment RPC to prevent race conditions under concurrent requests
CREATE OR REPLACE FUNCTION public.increment_user_query_count(p_user_id uuid)
RETURNS public.user_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sub public.user_subscriptions;
BEGIN
  INSERT INTO public.user_subscriptions (user_id, plan, queries_used, queries_limit)
  VALUES (p_user_id, 'free', 1, 15)
  ON CONFLICT (user_id) DO UPDATE
    SET queries_used = public.user_subscriptions.queries_used + 1,
        updated_at = now()
  RETURNING * INTO v_sub;

  RETURN v_sub;
END;
$$;
