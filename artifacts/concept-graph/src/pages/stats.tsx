import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';

interface StatsResponse {
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
    plan: 'free' | 'pro';
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
    properties: Record<string, string | number | boolean>;
    createdAt: string;
  }>;
}

const FUNNEL_LABELS: Array<{ key: string; label: string }> = [
  { key: 'page_view', label: 'Site page views' },
  { key: 'demo_term_click', label: 'Demo term clicks' },
  { key: 'demo_prereq_click', label: 'Demo prerequisite clicks' },
  { key: 'demo_followup_open', label: 'Demo follow-up opens' },
  { key: 'demo_open', label: 'Demo reopened' },
  { key: 'auth_open', label: 'Auth modal opened' },
  { key: 'auth_signin', label: 'Sign-ins completed' },
  { key: 'auth_signup', label: 'Sign-ups completed' },
  { key: 'notebook_create', label: 'Notebooks created' },
  { key: 'source_upload', label: 'PDFs / images added' },
  { key: 'settings_open', label: 'Settings opened' },
  { key: 'api_key_saved', label: 'API keys saved' },
  { key: 'checkout_click', label: 'Upgrade clicked' },
  { key: 'checkout_started', label: 'Stripe checkout opened' },
  { key: 'voice_start', label: 'Voice input used' },
  { key: 'reader_mode_toggle', label: 'Reader mode opened' },
];

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatProperties(props: Record<string, string | number | boolean>): string {
  const entries = Object.entries(props);
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `${k}: ${String(v)}`).join(' · ');
}

export default function StatsPage() {
  const { session, user, loading: authLoading } = useAuth();
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    setStatusCode(null);

    try {
      const res = await fetch(`/api/stats?days=${days}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setStatusCode(res.status);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.error === 'string' ? body.error : `Request failed (${res.status})`);
      }
      const json = (await res.json()) as StatsResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load stats.');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, days]);

  useEffect(() => {
    if (!authLoading && session?.access_token) {
      void loadStats();
    }
  }, [authLoading, session?.access_token, loadStats]);

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center">
          <h1 className="font-serif text-2xl font-semibold text-foreground">Owner Stats</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with your authorized account to view site analytics and usage.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={() => window.dispatchEvent(new Event('open-auth'))}>
              Sign in
            </Button>
            <a href={import.meta.env.BASE_URL} className="mt-2 text-xs text-muted-foreground hover:text-foreground">
              Back to Study Notebook
            </a>
          </div>
        </div>
      </main>
    );
  }

  if (statusCode === 403) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <h1 className="font-serif text-2xl font-semibold text-foreground">Access restricted</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {user.email ? `Signed in as ${user.email}, which is not listed as an admin.` : 'This account is not authorized to view stats.'}
          </p>
          <a
            href={import.meta.env.BASE_URL}
            className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go to Study Notebook
          </a>
        </div>
      </main>
    );
  }

  const maxDailyActivity = data
    ? Math.max(1, ...data.daily.map((d) => d.pageViews + d.demoClicks + d.aiQueries))
    : 1;
  const maxFunnelCount = data
    ? Math.max(1, ...FUNNEL_LABELS.map((item) => data.funnel[item.key] ?? 0))
    : 1;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 md:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Private Dashboard · {user.email}
            </p>
            <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight">Study Notebook Stats</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
              {([7, 30, 90] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDays(option)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    days === option
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {option}d
                </button>
              ))}
            </div>

            <Button variant="outline" size="sm" onClick={() => void loadStats()} disabled={loading} className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>

            <a
              href={import.meta.env.BASE_URL}
              className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Open App
            </a>
          </div>
        </header>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {data && !data.tableReady && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
            The <code className="font-mono text-xs">public.analytics_events</code> table is not created in Supabase yet. Run{' '}
            <code className="font-mono text-xs">supabase/migrations/002_analytics_events.sql</code> in the Supabase SQL Editor to start persisting events across restarts.
          </div>
        )}

        {loading && !data ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : data ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-border/70 bg-card p-5">
                <p className="text-xs font-medium text-muted-foreground">Unique Visitors ({data.windowDays}d)</p>
                <p className="mt-2 font-serif text-3xl font-semibold tabular-nums">{data.summary.uniqueSessions}</p>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {data.summary.pageViews} page views · {data.summary.totalEvents} total events
                </p>
              </div>

              <div className="rounded-xl border border-border/70 bg-card p-5">
                <p className="text-xs font-medium text-muted-foreground">Registered Accounts</p>
                <p className="mt-2 font-serif text-3xl font-semibold tabular-nums">{data.summary.registeredUsers}</p>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {data.summary.proUsers} Pro · {data.summary.freeUsers} Free · {data.summary.activeUsersInWindow} active ({data.windowDays}d)
                </p>
              </div>

              <div className="rounded-xl border border-border/70 bg-card p-5">
                <p className="text-xs font-medium text-muted-foreground">AI Questions ({data.windowDays}d)</p>
                <p className="mt-2 font-serif text-3xl font-semibold tabular-nums">{data.summary.aiQueries}</p>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {data.summary.serverPoolQueries} server pool · {data.summary.byokQueries} BYOK · {data.summary.deniedQueries} blocked
                </p>
              </div>

              <div className="rounded-xl border border-border/70 bg-card p-5">
                <p className="text-xs font-medium text-muted-foreground">Server Pool Cost (Total)</p>
                <p className="mt-2 font-serif text-3xl font-semibold tabular-nums">
                  ${data.summary.totalServerCostUsd.toFixed(2)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Updated {formatRelativeTime(data.generatedAt)}
                </p>
              </div>
            </section>

            <section className="rounded-xl border border-border/70 bg-card p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-serif text-lg font-semibold">Daily Activity ({data.windowDays}d)</h2>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-xs bg-primary" /> Page views
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-xs bg-primary/45" /> Demo clicks
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-xs bg-foreground/70" /> AI queries
                  </span>
                </div>
              </div>

              <div className="flex h-40 items-end gap-1 pt-4">
                {data.daily.map((day) => {
                  const total = day.pageViews + day.demoClicks + day.aiQueries;
                  const pvPct = (day.pageViews / maxDailyActivity) * 100;
                  const demoPct = (day.demoClicks / maxDailyActivity) * 100;
                  const aiPct = (day.aiQueries / maxDailyActivity) * 100;
                  return (
                    <div
                      key={day.date}
                      title={`${day.date}: ${day.uniqueSessions} visitors, ${day.pageViews} views, ${day.demoClicks} demo clicks, ${day.signIns} sign-ins, ${day.aiQueries} AI queries`}
                      className="group flex h-full flex-1 flex-col justify-end gap-px"
                    >
                      <div className="flex w-full flex-1 flex-col justify-end overflow-hidden rounded-t-sm bg-muted/30">
                        {aiPct > 0 && (
                          <div className="w-full bg-foreground/70" style={{ height: `${Math.max(3, aiPct)}%` }} />
                        )}
                        {demoPct > 0 && (
                          <div className="w-full bg-primary/45" style={{ height: `${Math.max(3, demoPct)}%` }} />
                        )}
                        {pvPct > 0 && (
                          <div className="w-full bg-primary" style={{ height: `${Math.max(3, pvPct)}%` }} />
                        )}
                        {total === 0 && <div className="h-px w-full bg-border/60" />}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex justify-between text-xs text-muted-foreground tabular-nums">
                <span>{data.daily[0]?.date}</span>
                <span>{data.daily[Math.floor(data.daily.length / 2)]?.date}</span>
                <span>{data.daily[data.daily.length - 1]?.date}</span>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-border/70 bg-card p-6">
                <h2 className="mb-4 font-serif text-lg font-semibold">Visitor &amp; Demo Funnel</h2>
                <div className="space-y-3">
                  {FUNNEL_LABELS.map(({ key, label }) => {
                    const count = data.funnel[key] ?? 0;
                    const widthPct = count > 0 ? Math.max(4, Math.round((count / maxFunnelCount) * 100)) : 0;
                    return (
                      <div key={key} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-foreground">{label}</span>
                          <span className="font-medium tabular-nums text-muted-foreground">{count}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          {widthPct > 0 && (
                            <div className="h-full rounded-full bg-primary" style={{ width: `${widthPct}%` }} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-card p-6">
                <h2 className="mb-4 font-serif text-lg font-semibold">Models Requested</h2>
                {data.models.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No AI queries recorded in this window yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="pb-2 font-medium">Model</th>
                          <th className="pb-2 font-medium text-right">Total</th>
                          <th className="pb-2 font-medium text-right">Pool</th>
                          <th className="pb-2 font-medium text-right">BYOK</th>
                          <th className="pb-2 font-medium text-right">Blocked</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60 tabular-nums">
                        {data.models.map((row) => (
                          <tr key={`${row.provider}:${row.model}`}>
                            <td className="py-2.5 pr-3">
                              <span className="font-medium text-foreground">{row.model}</span>
                              <span className="ml-1.5 text-muted-foreground">({row.provider})</span>
                            </td>
                            <td className="py-2.5 text-right font-semibold">{row.total}</td>
                            <td className="py-2.5 text-right text-muted-foreground">{row.serverPool}</td>
                            <td className="py-2.5 text-right text-muted-foreground">{row.byok}</td>
                            <td className="py-2.5 text-right text-muted-foreground">{row.denied}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-border/70 bg-card p-6">
              <h2 className="mb-4 font-serif text-lg font-semibold">Accounts &amp; Quota Usage</h2>
              {data.users.length === 0 ? (
                <p className="text-sm text-muted-foreground">No account rows yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="pb-2 font-medium">Email</th>
                        <th className="pb-2 font-medium">Plan</th>
                        <th className="pb-2 font-medium text-right">Questions</th>
                        <th className="pb-2 font-medium text-right">Pool Spend</th>
                        <th className="pb-2 font-medium text-right">Last Active</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 tabular-nums">
                      {data.users.map((account) => (
                        <tr key={account.userId}>
                          <td className="py-2.5 pr-4 font-medium text-foreground">
                            {account.email || <span className="font-mono text-muted-foreground">{account.userId.slice(0, 8)}</span>}
                          </td>
                          <td className="py-2.5 pr-4">
                            <span
                              className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                                account.plan === 'pro'
                                  ? 'bg-primary/15 text-primary'
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {account.plan}
                            </span>
                          </td>
                          <td className="py-2.5 text-right">
                            {account.queriesUsed} / {account.queriesLimit}
                          </td>
                          <td className="py-2.5 text-right text-muted-foreground">
                            ${account.budgetUsedUsd.toFixed(3)}
                          </td>
                          <td className="py-2.5 text-right text-muted-foreground">
                            {formatRelativeTime(account.updatedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-border/70 bg-card p-6">
              <h2 className="mb-4 font-serif text-lg font-semibold">Recent Activity (Last 50)</h2>
              {data.recentEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events recorded in this window yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="pb-2 font-medium">When</th>
                        <th className="pb-2 font-medium">Event</th>
                        <th className="pb-2 font-medium">Who</th>
                        <th className="pb-2 font-medium">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {data.recentEvents.map((ev) => (
                        <tr key={ev.id}>
                          <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground tabular-nums">
                            {formatRelativeTime(ev.createdAt)}
                          </td>
                          <td className="py-2 pr-4">
                            <span className="inline-flex rounded bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
                              {ev.eventName}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            {ev.userEmail
                              ? ev.userEmail
                              : ev.userId
                                ? `user:${ev.userId.slice(0, 8)}`
                                : ev.sessionId
                                  ? `guest:${ev.sessionId.slice(0, 8)}`
                                  : 'anonymous'}
                          </td>
                          <td className="py-2 text-muted-foreground">
                            {formatProperties(ev.properties) || ev.path || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
