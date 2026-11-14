import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';

export type SubscriptionPlan = 'free' | 'pro';

export interface BillingStatus {
  authenticated: boolean;
  userId: string | null;
  email: string | null;
  plan: SubscriptionPlan;
  queriesUsed: number;
  queriesLimit: number;
  budgetUsedMicros?: number;
  budgetLimitMicros?: number;
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

const DEFAULT_BILLING_STATUS: BillingStatus = {
  authenticated: false,
  userId: null,
  email: null,
  plan: 'free',
  queriesUsed: 0,
  queriesLimit: 15,
  budgetUsedMicros: 0,
  budgetLimitMicros: 10_000_000,
  usagePercent: 0,
  remaining: 15,
  currentPeriodEnd: null,
  freeEligibleModels: ['gemini-3.1-flash-lite', 'gemini-3.8-flash'],
  stripeConfigured: false,
  serverKeysConfigured: {
    gemini: false,
    openai: false,
    anthropic: false,
  },
};

let cachedBillingStatus: BillingStatus = DEFAULT_BILLING_STATUS;
let hasFetchedOnce = false;
let inFlightPromise: Promise<BillingStatus> | null = null;
const subscribers = new Set<(status: BillingStatus) => void>();

function notifySubscribers(next: BillingStatus) {
  cachedBillingStatus = next;
  for (const listener of subscribers) {
    listener(next);
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchBillingStatusDeduped(): Promise<BillingStatus> {
  if (inFlightPromise) return inFlightPromise;

  inFlightPromise = (async () => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/billing/status', {
        headers: { ...authHeaders },
      });
      if (res.ok) {
        const data = (await res.json()) as BillingStatus;
        hasFetchedOnce = true;
        notifySubscribers(data);
        return data;
      }
    } catch {
      // Keep cached status on transient network failure
    } finally {
      inFlightPromise = null;
    }
    return cachedBillingStatus;
  })();

  return inFlightPromise;
}

let hasVerifiedUrlSession = false;

async function verifyCheckoutSessionFromUrl(): Promise<void> {
  if (typeof window === 'undefined' || hasVerifiedUrlSession) return;
  const params = new URLSearchParams(window.location.search);
  const billingParam = params.get('billing');
  const sessionId = params.get('session_id');
  if (!billingParam) return;

  hasVerifiedUrlSession = true;
  // Clean URL query parameters
  const cleanUrl = window.location.pathname + window.location.hash;
  window.history.replaceState({}, '', cleanUrl);

  if (billingParam === 'success' && sessionId) {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/billing/verify-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ sessionId }),
      });
      if (res.ok) {
        const data = (await res.json()) as { verified?: boolean };
        if (data.verified) {
          await fetchBillingStatusDeduped();
          toast({
            title: 'Upgraded to Pro Plan',
            description: 'Your Stripe subscription is active across all Gemini, OpenAI, and Claude models.',
          });
        }
      }
    } catch {
      // Webhook will reconcile if client verification fails
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('billing-updated', () => {
    void fetchBillingStatusDeduped();
  });
}

export function useBilling() {
  const [status, setStatus] = useState<BillingStatus>(cachedBillingStatus);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await fetchBillingStatusDeduped();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    subscribers.add(setStatus);
    void verifyCheckoutSessionFromUrl();
    if (!hasFetchedOnce) {
      void fetchBillingStatusDeduped();
    } else {
      setStatus(cachedBillingStatus);
    }
    return () => {
      subscribers.delete(setStatus);
    };
  }, []);

  const startCheckout = useCallback(async () => {
    setActionLoading(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ returnUrl: window.location.origin }),
      });

      const data = (await res.json()) as {
        mode?: 'stripe' | 'demo';
        url?: string | null;
        error?: string;
      };

      if (!res.ok) {
        toast({
          title: 'Could not start upgrade',
          description: data.error || 'Please sign in first to upgrade your plan.',
        });
        return;
      }

      if (data.mode === 'stripe' && data.url) {
        window.location.assign(data.url);
        return;
      }

      window.dispatchEvent(new CustomEvent('billing-updated'));
      toast({
        title: 'Upgraded to Pro Plan',
        description: 'You now have full monthly access across all Gemini, OpenAI, and Claude models.',
      });
    } catch {
      toast({
        title: 'Checkout error',
        description: 'Could not reach the billing server. Please try again.',
      });
    } finally {
      setActionLoading(false);
    }
  }, []);

  const openBillingPortal = useCallback(async () => {
    setActionLoading(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ returnUrl: window.location.origin }),
      });

      const data = (await res.json()) as {
        mode?: 'stripe' | 'demo';
        url?: string | null;
        error?: string;
      };

      if (!res.ok) {
        toast({
          title: 'Could not manage subscription',
          description: data.error || 'Please try again.',
        });
        return;
      }

      if (data.mode === 'stripe' && data.url) {
        window.location.assign(data.url);
        return;
      }

      window.dispatchEvent(new CustomEvent('billing-updated'));
      toast({
        title: 'Switched to Free Plan',
        description: 'Your subscription was cancelled and reverted to the Free tier.',
      });
    } catch {
      toast({
        title: 'Billing portal error',
        description: 'Could not reach the billing server. Please try again.',
      });
    } finally {
      setActionLoading(false);
    }
  }, []);

  return {
    status,
    loading,
    actionLoading,
    refresh,
    startCheckout,
    openBillingPortal,
  };
}
