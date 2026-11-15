import { useState, useEffect, useCallback } from 'react';
import { customFetch } from '@workspace/api-client-react';
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

const BILLING_CACHE_KEY = 'study-notebook-billing-cache-v1';

interface BillingSnapshot {
  status: BillingStatus;
  loading: boolean;
  synced: boolean;
  unavailable: boolean;
}

function readCachedBillingStatus(): BillingStatus | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(BILLING_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BillingStatus>;
    if (!parsed || parsed.authenticated !== true || typeof parsed.userId !== 'string') {
      return null;
    }
    return {
      ...DEFAULT_BILLING_STATUS,
      ...parsed,
      serverKeysConfigured: {
        ...DEFAULT_BILLING_STATUS.serverKeysConfigured,
        ...(parsed.serverKeysConfigured ?? {}),
      },
      freeEligibleModels: Array.isArray(parsed.freeEligibleModels)
        ? parsed.freeEligibleModels
        : DEFAULT_BILLING_STATUS.freeEligibleModels,
    };
  } catch {
    return null;
  }
}

function writeCachedBillingStatus(next: BillingStatus | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!next || !next.authenticated || !next.userId) {
      window.localStorage.removeItem(BILLING_CACHE_KEY);
    } else {
      window.localStorage.setItem(BILLING_CACHE_KEY, JSON.stringify(next));
    }
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

const initialCached = readCachedBillingStatus();

let snapshot: BillingSnapshot = {
  status: initialCached ?? DEFAULT_BILLING_STATUS,
  loading: false,
  synced: false,
  unavailable: false,
};

let hasFetchedOnce = false;
let inFlightPromise: Promise<BillingStatus> | null = null;
let retryTimer: number | null = null;
const subscribers = new Set<(next: BillingSnapshot) => void>();

function updateSnapshot(patch: Partial<BillingSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const listener of subscribers) {
    listener(snapshot);
  }
}

async function getSessionAuth(): Promise<{ userId: string | null; headers: Record<string, string> }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const userId = data.session?.user?.id ?? null;
  return {
    userId,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
}

function scheduleBackgroundRetry() {
  if (typeof window === 'undefined' || retryTimer !== null) return;
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    if (!snapshot.synced) {
      void fetchBillingStatusDeduped();
    }
  }, 5_000);
}

async function fetchBillingStatusDeduped(): Promise<BillingStatus> {
  if (inFlightPromise) return inFlightPromise;

  updateSnapshot({ loading: true });

  inFlightPromise = (async () => {
    try {
      const { userId, headers } = await getSessionAuth();
      if (!headers.Authorization || !userId) {
        hasFetchedOnce = true;
        writeCachedBillingStatus(null);
        updateSnapshot({
          status: DEFAULT_BILLING_STATUS,
          loading: false,
          synced: true,
          unavailable: false,
        });
        return DEFAULT_BILLING_STATUS;
      }

      // Discard cached billing data if a different Supabase user is now signed in
      if (snapshot.status.userId && snapshot.status.userId !== userId) {
        writeCachedBillingStatus(null);
        updateSnapshot({ status: DEFAULT_BILLING_STATUS });
      }

      const data = await customFetch<BillingStatus>('/api/billing/status', {
        headers: { ...headers },
      });
      hasFetchedOnce = true;
      writeCachedBillingStatus(data.authenticated ? data : null);
      updateSnapshot({
        status: data,
        loading: false,
        synced: true,
        unavailable: false,
      });
      return data;
    } catch {
      updateSnapshot({
        loading: false,
        unavailable: true,
      });
      scheduleBackgroundRetry();
    } finally {
      inFlightPromise = null;
    }
    return snapshot.status;
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
      const { headers } = await getSessionAuth();
      const res = await fetch('/api/billing/verify-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
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
  const triggerRefresh = () => {
    void fetchBillingStatusDeduped();
  };
  window.addEventListener('billing-updated', triggerRefresh);
  window.addEventListener('server-awake', triggerRefresh);
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.access_token) {
      void fetchBillingStatusDeduped();
    } else {
      writeCachedBillingStatus(null);
      updateSnapshot({
        status: DEFAULT_BILLING_STATUS,
        loading: false,
        synced: true,
        unavailable: false,
      });
    }
  });
}

export function useBilling() {
  const [state, setState] = useState<BillingSnapshot>(snapshot);
  const [actionLoading, setActionLoading] = useState(false);

  const refresh = useCallback(async () => {
    await fetchBillingStatusDeduped();
  }, []);

  useEffect(() => {
    subscribers.add(setState);
    void verifyCheckoutSessionFromUrl();
    if (!hasFetchedOnce) {
      void fetchBillingStatusDeduped();
    } else {
      setState(snapshot);
    }
    return () => {
      subscribers.delete(setState);
    };
  }, []);

  const startCheckout = useCallback(async () => {
    setActionLoading(true);
    try {
      const { headers } = await getSessionAuth();
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
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
      const { headers } = await getSessionAuth();
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
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
    status: state.status,
    loading: state.loading,
    synced: state.synced,
    unavailable: state.unavailable,
    actionLoading,
    refresh,
    startCheckout,
    openBillingPortal,
  };
}
