import crypto from "node:crypto";
import {
  getSupabaseRestConfig,
  listSubscriptionsForStats,
  normalizeCanonicalEmail,
  type AuthenticatedUser,
} from "./billing";

export const ALLOWED_CLIENT_EVENTS = new Set<string>([
  "page_view",
  "demo_open",
  "demo_term_click",
  "demo_prereq_click",
  "demo_followup_open",
  "auth_open",
  "auth_signin",
  "auth_signup",
  "settings_open",
  "api_key_saved",
  "checkout_click",
  "notebook_create",
  "source_upload",
  "voice_start",
  "reader_mode_toggle",
]);

export type AnalyticsScalar = string | number | boolean;

export interface StoredAnalyticsEvent {
  id: string;
  eventName: string;
  sessionId: string | null;
  userId: string | null;
  path: string | null;
  properties: Record<string, AnalyticsScalar>;
  createdAt: string;
}

export interface RecordAnalyticsEventInput {
  eventName: string;
  sessionId?: string | null;
  userId?: string | null;
  path?: string | null;
  properties?: Record<string, unknown>;
}

const MAX_MEMORY_EVENTS = 2000;
const memoryEvents: StoredAnalyticsEvent[] = [];
let supabaseAnalyticsTableReady = true;

export function resetAnalyticsStoreForTests(): void {
  memoryEvents.length = 0;
  supabaseAnalyticsTableReady = true;
}

function sanitizeString(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function sanitizeProperties(raw?: Record<string, unknown>): Record<string, AnalyticsScalar> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const clean: Record<string, AnalyticsScalar> = {};
  let count = 0;
  for (const [key, val] of Object.entries(raw)) {
    if (count >= 10) break;
    const safeKey = key.trim().slice(0, 40);
    if (!safeKey) continue;
    if (typeof val === "string") {
      clean[safeKey] = val.trim().slice(0, 120);
      count += 1;
    } else if (typeof val === "number" && Number.isFinite(val)) {
      clean[safeKey] = val;
      count += 1;
    } else if (typeof val === "boolean") {
      clean[safeKey] = val;
      count += 1;
    }
  }
  return clean;
}

function parseCsvEnv(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Checks whether the authenticated user is listed in `ADMIN_USER_IDS` or `ADMIN_EMAILS`.
 * Fails closed when neither matches or no admin allowlist is configured.
 */
export function isAdminUser(user: AuthenticatedUser | null | undefined): boolean {
  if (!user) return false;

  const adminIds = parseCsvEnv(process.env.ADMIN_USER_IDS);
  if (adminIds.includes(user.id)) {
    return true;
  }

  const adminEmails = parseCsvEnv(process.env.ADMIN_EMAILS).map((e) => e.toLowerCase());
  if (adminEmails.length === 0 || !user.email) {
    return false;
  }

  const userEmailLower = user.email.trim().toLowerCase();
  if (adminEmails.includes(userEmailLower)) {
    return true;
  }

  const userCanonical = normalizeCanonicalEmail(user.email);
  return Boolean(
    userCanonical && adminEmails.some((allowed) => normalizeCanonicalEmail(allowed) === userCanonical),
  );
}

/**
 * Persists an analytics event without throwing, so telemetry never disrupts study or billing requests.
 */
export async function recordAnalyticsEvent(input: RecordAnalyticsEventInput): Promise<void> {
  const eventName = sanitizeString(input.eventName, 64);
  if (!eventName) return;

  const event: StoredAnalyticsEvent = {
    id: crypto.randomUUID(),
    eventName,
    sessionId: sanitizeString(input.sessionId, 80),
    userId: sanitizeString(input.userId, 64),
    path: sanitizeString(input.path, 120),
    properties: sanitizeProperties(input.properties),
    createdAt: new Date().toISOString(),
  };

  memoryEvents.unshift(event);
  if (memoryEvents.length > MAX_MEMORY_EVENTS) {
    memoryEvents.length = MAX_MEMORY_EVENTS;
  }

  const supabaseConfig = getSupabaseRestConfig();
  if (!supabaseConfig) return;

  try {
    const res = await fetch(`${supabaseConfig.url}/rest/v1/analytics_events`, {
      method: "POST",
      headers: {
        ...supabaseConfig.headers,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        id: event.id,
        event_name: event.eventName,
        session_id: event.sessionId,
        user_id: event.userId,
        path: event.path,
        properties: event.properties,
        created_at: event.createdAt,
      }),
    });

    if (res.ok) {
      supabaseAnalyticsTableReady = true;
    } else if (res.status === 404) {
      supabaseAnalyticsTableReady = false;
    }
  } catch {
    // Non-fatal: ignore transient network failures for telemetry
  }
}

function mapSupabaseEventRow(row: Record<string, unknown>): StoredAnalyticsEvent {
  return {
    id: typeof row.id === "string" ? row.id : crypto.randomUUID(),
    eventName: typeof row.event_name === "string" ? row.event_name : "unknown",
    sessionId: typeof row.session_id === "string" ? row.session_id : null,
    userId: typeof row.user_id === "string" ? row.user_id : null,
    path: typeof row.path === "string" ? row.path : null,
    properties:
      row.properties && typeof row.properties === "object" && !Array.isArray(row.properties)
        ? sanitizeProperties(row.properties as Record<string, unknown>)
        : {},
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  };
}

async function fetchEventsSince(sinceIso: string): Promise<{ events: StoredAnalyticsEvent[]; tableReady: boolean }> {
  const supabaseConfig = getSupabaseRestConfig();
  if (supabaseConfig) {
    try {
      const res = await fetch(
        `${supabaseConfig.url}/rest/v1/analytics_events?created_at=gte.${encodeURIComponent(sinceIso)}&select=*&order=created_at.desc&limit=10000`,
        { headers: supabaseConfig.headers },
      );
      if (res.ok) {
        const rows = (await res.json()) as Array<Record<string, unknown>>;
        supabaseAnalyticsTableReady = true;
        return {
          events: rows.map(mapSupabaseEventRow),
          tableReady: true,
        };
      }
      if (res.status === 404) {
        supabaseAnalyticsTableReady = false;
        return {
          events: memoryEvents.filter((e) => e.createdAt >= sinceIso),
          tableReady: false,
        };
      }
    } catch {
      // Fall back to memory ring buffer if transient network failure
    }
  }

  return {
    events: memoryEvents.filter((e) => e.createdAt >= sinceIso),
    tableReady: supabaseAnalyticsTableReady,
  };
}

export interface StatsResponse {
  windowDays: number;
  generatedAt: string;
  tableReady: boolean;
  summary: {
    uniqueSessions: number;
    pageViews: number;
    totalEvents: number;
    registeredUsers: number;
    proUsers: number;
    freeUsers: number;
    activeUsersInWindow: number;
    aiQueries: number;
    serverPoolQueries: number;
    byokQueries: number;
    deniedQueries: number;
    totalServerCostUsd: number;
  };
  funnel: Record<string, number>;
  daily: Array<{
    date: string;
    pageViews: number;
    uniqueSessions: number;
    demoClicks: number;
    signIns: number;
    aiQueries: number;
  }>;
  models: Array<{
    model: string;
    provider: string;
    total: number;
    serverPool: number;
    byok: number;
    denied: number;
  }>;
  users: Array<{
    userId: string;
    email: string | null;
    plan: "free" | "pro";
    queriesUsed: number;
    queriesLimit: number;
    budgetUsedUsd: number;
    budgetLimitUsd: number;
    updatedAt: string;
  }>;
  recentEvents: Array<{
    id: string;
    eventName: string;
    path: string | null;
    sessionId: string | null;
    userId: string | null;
    userEmail: string | null;
    properties: Record<string, AnalyticsScalar>;
    createdAt: string;
  }>;
}

const DEMO_EVENTS = new Set(["demo_open", "demo_term_click", "demo_prereq_click", "demo_followup_open"]);

export async function getStatsSnapshot(days = 30): Promise<StatsResponse> {
  const windowDays = Math.max(1, Math.min(90, Math.floor(days)));
  const now = new Date();
  const since = new Date(now.getTime() - (windowDays - 1) * 24 * 60 * 60 * 1000);
  since.setUTCHours(0, 0, 0, 0);
  const sinceIso = since.toISOString();

  const [{ events, tableReady }, subscriptions] = await Promise.all([
    fetchEventsSince(sinceIso),
    listSubscriptionsForStats(200),
  ]);

  const emailByUserId = new Map<string, string>();
  let proUsers = 0;
  let totalCostMicros = 0;
  for (const sub of subscriptions) {
    if (sub.email) emailByUserId.set(sub.userId, sub.email);
    if (sub.plan === "pro") proUsers += 1;
    totalCostMicros += sub.budgetUsedMicros;
  }

  const sessions = new Set<string>();
  const activeUsers = new Set<string>();
  const funnel: Record<string, number> = {
    page_view: 0,
    demo_open: 0,
    demo_term_click: 0,
    demo_prereq_click: 0,
    demo_followup_open: 0,
    auth_open: 0,
    auth_signin: 0,
    auth_signup: 0,
    api_key_saved: 0,
    checkout_click: 0,
    checkout_started: 0,
    notebook_create: 0,
    source_upload: 0,
    voice_start: 0,
    reader_mode_toggle: 0,
  };

  let pageViews = 0;
  let aiQueries = 0;
  let serverPoolQueries = 0;
  let byokQueries = 0;
  let deniedQueries = 0;

  const modelMap = new Map<
    string,
    { model: string; provider: string; total: number; serverPool: number; byok: number; denied: number }
  >();

  // Prepare ordered UTC date buckets for the entire window so empty days still render smoothly
  const dailyMap = new Map<
    string,
    {
      date: string;
      pageViews: number;
      sessions: Set<string>;
      demoClicks: number;
      signIns: number;
      aiQueries: number;
    }
  >();
  for (let i = 0; i < windowDays; i++) {
    const dayDate = new Date(since.getTime() + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    dailyMap.set(dayDate, {
      date: dayDate,
      pageViews: 0,
      sessions: new Set<string>(),
      demoClicks: 0,
      signIns: 0,
      aiQueries: 0,
    });
  }

  for (const ev of events) {
    if (ev.sessionId) sessions.add(ev.sessionId);
    if (ev.userId) activeUsers.add(ev.userId);
    if (ev.eventName in funnel) {
      funnel[ev.eventName] += 1;
    }

    const dayKey = ev.createdAt.slice(0, 10);
    const bucket = dailyMap.get(dayKey);
    if (bucket && ev.sessionId) {
      bucket.sessions.add(ev.sessionId);
    }

    if (ev.eventName === "page_view") {
      pageViews += 1;
      if (bucket) bucket.pageViews += 1;
    } else if (DEMO_EVENTS.has(ev.eventName)) {
      if (bucket) bucket.demoClicks += 1;
    } else if (ev.eventName === "auth_signin" || ev.eventName === "auth_signup") {
      if (bucket) bucket.signIns += 1;
    } else if (ev.eventName === "ai_query") {
      aiQueries += 1;
      if (bucket) bucket.aiQueries += 1;

      const authMode = String(ev.properties.authMode ?? "");
      if (authMode === "byok") byokQueries += 1;
      else if (authMode === "denied") deniedQueries += 1;
      else serverPoolQueries += 1;

      const model = String(ev.properties.model ?? "unknown");
      const provider = String(ev.properties.provider ?? "unknown");
      const key = `${provider}:${model}`;
      const existing = modelMap.get(key) ?? {
        model,
        provider,
        total: 0,
        serverPool: 0,
        byok: 0,
        denied: 0,
      };
      existing.total += 1;
      if (authMode === "byok") existing.byok += 1;
      else if (authMode === "denied") existing.denied += 1;
      else existing.serverPool += 1;
      modelMap.set(key, existing);
    }
  }

  const daily = Array.from(dailyMap.values()).map((d) => ({
    date: d.date,
    pageViews: d.pageViews,
    uniqueSessions: d.sessions.size,
    demoClicks: d.demoClicks,
    signIns: d.signIns,
    aiQueries: d.aiQueries,
  }));

  const models = Array.from(modelMap.values()).sort((a, b) => b.total - a.total);

  const users = subscriptions.map((sub) => ({
    userId: sub.userId,
    email: sub.email ?? null,
    plan: sub.plan,
    queriesUsed: sub.queriesUsed,
    queriesLimit: sub.queriesLimit,
    budgetUsedUsd: Number((sub.budgetUsedMicros / 1_000_000).toFixed(4)),
    budgetLimitUsd: Number((sub.budgetLimitMicros / 1_000_000).toFixed(2)),
    updatedAt: sub.updatedAt,
  }));

  const recentEvents = events.slice(0, 50).map((ev) => ({
    id: ev.id,
    eventName: ev.eventName,
    path: ev.path,
    sessionId: ev.sessionId,
    userId: ev.userId,
    userEmail: ev.userId ? emailByUserId.get(ev.userId) ?? null : null,
    properties: ev.properties,
    createdAt: ev.createdAt,
  }));

  return {
    windowDays,
    generatedAt: now.toISOString(),
    tableReady,
    summary: {
      uniqueSessions: sessions.size,
      pageViews,
      totalEvents: events.length,
      registeredUsers: subscriptions.length,
      proUsers,
      freeUsers: Math.max(0, subscriptions.length - proUsers),
      activeUsersInWindow: activeUsers.size,
      aiQueries,
      serverPoolQueries,
      byokQueries,
      deniedQueries,
      totalServerCostUsd: Number((totalCostMicros / 1_000_000).toFixed(4)),
    },
    funnel,
    daily,
    models,
    users,
    recentEvents,
  };
}
