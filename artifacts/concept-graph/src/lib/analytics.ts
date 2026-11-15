import { supabase } from '@/lib/supabase';

const SESSION_STORAGE_KEY = 'study-notebook-analytics-session';

function getSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const created = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return 'ephemeral';
  }
}

export type ClientAnalyticsEvent =
  | 'page_view'
  | 'demo_open'
  | 'demo_term_click'
  | 'demo_prereq_click'
  | 'demo_followup_open'
  | 'auth_open'
  | 'auth_signin'
  | 'auth_signup'
  | 'settings_open'
  | 'api_key_saved'
  | 'checkout_click'
  | 'notebook_create'
  | 'source_upload'
  | 'voice_start'
  | 'reader_mode_toggle';

export type AnalyticsProperties = Record<string, string | number | boolean | undefined>;

/**
 * Fires a lightweight, non-blocking product analytics event.
 * Skips automated WebDriver browsers (E2E tests & crawlers) and visits to `/stats` itself.
 */
export function trackEvent(
  eventName: ClientAnalyticsEvent,
  properties?: AnalyticsProperties,
  options?: { onceKey?: string },
): void {
  if (typeof window === 'undefined') return;
  if (typeof navigator !== 'undefined' && navigator.webdriver) return;
  if (window.location.pathname.startsWith('/stats')) return;

  if (options?.onceKey) {
    try {
      const dedupeKey = `study-notebook-tracked:${options.onceKey}`;
      if (window.sessionStorage.getItem(dedupeKey)) return;
      window.sessionStorage.setItem(dedupeKey, '1');
    } catch {
      // Ignore storage failures
    }
  }

  const sessionId = getSessionId();
  const path = window.location.pathname || '/';
  const cleanProps: Record<string, string | number | boolean> = {};
  if (properties) {
    for (const [k, v] of Object.entries(properties)) {
      if (v !== undefined) cleanProps[k] = v;
    }
  }

  void (async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      await fetch('/api/analytics/event', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          eventName,
          sessionId,
          path,
          properties: cleanProps,
        }),
        keepalive: true,
      });
    } catch {
      // Telemetry must never interrupt user actions
    }
  })();
}
