import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CreditCard, Key, Loader2, Paintbrush, RotateCcw } from 'lucide-react';
import { useThemeCustomization, type ThemeColors } from '@/hooks/use-theme';
import { useBilling } from '@/hooks/use-billing';
import { contrastRatio, getCssVariableHex } from '@/lib/colors';
import { trackEvent } from '@/lib/analytics';

export type SettingsTab = 'plan' | 'api' | 'appearance';

const COLOR_FIELDS: { key: keyof ThemeColors; label: string; hint: string }[] = [
  { key: 'primary', label: 'Accent', hint: 'Buttons, links and underlined terms.' },
  { key: 'background', label: 'Background', hint: 'The main page behind your notes.' },
  { key: 'secondaryBackground', label: 'Panels', hint: 'Answer cards, the sidebar and menus.' },
  { key: 'foreground', label: 'Text', hint: 'Body text and icons.' },
  { key: 'secondaryForeground', label: 'Secondary text', hint: 'Hints, citations and inactive tabs.' },
];

export function SettingsModal() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>('plan');
  const [limitNotice, setLimitNotice] = useState<string | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const [geminiKey, setGeminiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');

  const { colors, updateColor, resetColors } = useThemeCustomization();
  const { status: billing, actionLoading, refresh: refreshBilling, startCheckout, openBillingPortal } = useBilling();
  const [defaultHex, setDefaultHex] = useState<Record<keyof ThemeColors, string>>({
    primary: '#126e61', background: '#f8f8f7', secondaryBackground: '#fefefe', foreground: '#1b1f27', secondaryForeground: '#595e69',
  });

  useEffect(() => {
    const existingGemini = window.localStorage.getItem('study-notebook-gemini-key') || window.localStorage.getItem('study-notebook-api-key');
    const existingOpenai = window.localStorage.getItem('study-notebook-openai-key');
    const existingAnthropic = window.localStorage.getItem('study-notebook-anthropic-key');

    if (existingGemini) setGeminiKey(existingGemini);
    if (existingOpenai) setOpenaiKey(existingOpenai);
    if (existingAnthropic) setAnthropicKey(existingAnthropic);

    const handleOpen = (e: Event) => {
      // Opened by an event rather than a Radix trigger, so remember where focus should return
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      const detail = (e as CustomEvent).detail;
      const resolvedTab =
        e.type === 'open-api-key-modal'
          ? 'api'
          : detail?.tab
            ? detail.tab
            : 'plan';
      setActiveTab(resolvedTab);
      trackEvent('settings_open', { tab: String(resolvedTab) });
      setLimitNotice(typeof detail?.notice === 'string' ? detail.notice : null);
      refreshBilling();
      // Read the theme's own values, ignoring any custom overrides, so the pickers start from them
      const getTrueDefault = (variable: string) => {
        const root = document.documentElement;
        const old = root.style.getPropertyValue(variable);
        root.style.removeProperty(variable);
        const hex = getCssVariableHex(variable);
        if (old) root.style.setProperty(variable, old);
        return hex;
      };
      setDefaultHex({
        primary: getTrueDefault('--primary'),
        background: getTrueDefault('--background'),
        secondaryBackground: getTrueDefault('--card'),
        foreground: getTrueDefault('--foreground'),
        secondaryForeground: getTrueDefault('--muted-foreground'),
      });
      setOpen(true);
    };

    window.addEventListener('open-settings', handleOpen);
    // Legacy event name still used by older buttons
    window.addEventListener('open-api-key-modal', handleOpen);

    return () => {
      window.removeEventListener('open-settings', handleOpen);
      window.removeEventListener('open-api-key-modal', handleOpen);
    };
  }, [refreshBilling]);

  const handleSaveApiKeys = () => {
    if (geminiKey.trim()) window.localStorage.setItem('study-notebook-gemini-key', geminiKey.trim());
    else window.localStorage.removeItem('study-notebook-gemini-key');

    if (openaiKey.trim()) window.localStorage.setItem('study-notebook-openai-key', openaiKey.trim());
    else window.localStorage.removeItem('study-notebook-openai-key');

    if (anthropicKey.trim()) window.localStorage.setItem('study-notebook-anthropic-key', anthropicKey.trim());
    else window.localStorage.removeItem('study-notebook-anthropic-key');

    trackEvent('api_key_saved', {
      gemini: Boolean(geminiKey.trim()),
      openai: Boolean(openaiKey.trim()),
      anthropic: Boolean(anthropicKey.trim()),
    });
    setOpen(false);
    window.dispatchEvent(new Event('api-keys-updated'));
  };

  const hasAnyByokKey = Boolean(geminiKey.trim() || openaiKey.trim() || anthropicKey.trim());
  const usagePercent =
    typeof billing.usagePercent === 'number'
      ? billing.usagePercent
      : billing.queriesUsed <= 0
        ? 0
        : Math.min(100, Math.round((billing.queriesUsed / Math.max(1, billing.queriesLimit)) * 100));

  const effective = (key: keyof ThemeColors) => colors[key] || defaultHex[key];
  const contrastChecks = [
    { label: 'Text on the background', ratio: contrastRatio(effective('foreground'), effective('background')) },
    { label: 'Text on panels', ratio: contrastRatio(effective('foreground'), effective('secondaryBackground')) },
    { label: 'Secondary text on panels', ratio: contrastRatio(effective('secondaryForeground'), effective('secondaryBackground')) },
    { label: 'Accent links on the background', ratio: contrastRatio(effective('primary'), effective('background')) },
  ];
  const lowContrast = contrastChecks.filter(check => check.ratio < 4.5);

  const tabButton = (tab: SettingsTab, label: string, Icon: typeof Key) => (
    <button
      type="button"
      role="tab"
      id={`settings-tab-${tab}`}
      aria-selected={activeTab === tab}
      aria-controls={`settings-panel-${tab}`}
      onClick={() => setActiveTab(tab)}
      className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-[color,border-color,transform] duration-150 ease-out active:scale-[0.98] ${
        activeTab === tab ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) { setOpen(false); setLimitNotice(null); } }}>
      <DialogContent
        className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-[500px]"
        onCloseAutoFocus={(e) => {
          if (returnFocusRef.current?.isConnected) {
            e.preventDefault();
            returnFocusRef.current.focus();
          }
        }}
      >
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="font-serif text-2xl font-semibold">Settings</DialogTitle>
          <DialogDescription>API keys and appearance are saved in this browser only.</DialogDescription>
        </DialogHeader>

        <div role="tablist" aria-label="Settings sections" className="flex gap-5 border-b border-border px-6 pt-2">
          {tabButton('plan', 'Plan & Usage', CreditCard)}
          {tabButton('api', 'API keys', Key)}
          {tabButton('appearance', 'Appearance', Paintbrush)}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'plan' && (
            <div role="tabpanel" id="settings-panel-plan" aria-labelledby="settings-tab-plan" className="space-y-6">
              {(limitNotice || (billing.authenticated && billing.remaining === 0 && !hasAnyByokKey)) && (
                <div
                  role="alert"
                  data-testid="plan-limit-banner"
                  className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground"
                >
                  <p className="font-semibold">
                    {limitNotice ||
                      (billing.plan === 'pro'
                        ? "You've used 100% of your included monthly Pro usage."
                        : `You've used all ${billing.queriesLimit} included questions on your Free plan.`)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {billing.plan === 'free'
                      ? 'Upgrade to Pro for $8/month to use all Google, OpenAI, and Claude models, or add a personal API key for unlimited use.'
                      : 'Add a personal API key in the API keys tab to continue with unlimited usage.'}
                  </p>
                </div>
              )}

              {!billing.authenticated ? (
                <div className="space-y-4">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">Guest session</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Sign up to get 15 free questions on Gemini Flash without needing your own API key.
                      </p>
                    </div>
                    {hasAnyByokKey && (
                      <span className="shrink-0 rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                        BYOK active
                      </span>
                    )}
                  </div>
                  <Button
                    onClick={() => {
                      setOpen(false);
                      window.dispatchEvent(new CustomEvent('open-auth', { detail: { mode: 'signup' } }));
                    }}
                    className="w-full"
                  >
                    Create free account or sign in
                  </Button>
                </div>
              ) : (
                <div className="space-y-4" data-testid="plan-status-card">
                  <div className="flex items-baseline justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-foreground">
                          {billing.plan === 'pro' ? 'Pro plan' : 'Free plan'}
                        </h3>
                        {hasAnyByokKey && (
                          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            Personal key active
                          </span>
                        )}
                      </div>
                      {billing.email && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{billing.email}</p>
                      )}
                    </div>
                    <span className="text-base font-semibold text-foreground tabular-nums">
                      {billing.plan === 'pro' ? '$8 / month' : '$0'}
                    </span>
                  </div>

                  <div className="space-y-2 pt-1">
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="text-muted-foreground tabular-nums">
                        {billing.plan === 'pro'
                          ? `${usagePercent}% used this month`
                          : `${billing.queriesUsed} used`}
                      </span>
                      <span className="font-medium text-foreground tabular-nums" data-testid="plan-usage-count">
                        {billing.plan === 'pro'
                          ? `${Math.max(0, 100 - usagePercent)}% remaining`
                          : `${billing.remaining} of ${billing.queriesLimit} questions left`}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      {usagePercent > 0 && (
                        <div
                          className={`h-full rounded-full transition-[width] duration-200 ease-out ${
                            billing.remaining === 0 ? 'bg-destructive' : 'bg-primary'
                          }`}
                          style={{ width: `${usagePercent}%` }}
                        />
                      )}
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Questions asked with your own key in{' '}
                      <button
                        type="button"
                        onClick={() => setActiveTab('api')}
                        className="font-medium text-foreground underline underline-offset-4 transition-[color,transform] duration-150 ease-out hover:text-primary active:scale-[0.97]"
                      >
                        API keys
                      </button>{' '}
                      never count toward this limit.
                    </p>
                  </div>
                </div>
              )}

              <div className="divide-y divide-border border-y border-border text-sm">
                <div className="flex items-baseline justify-between gap-4 py-3.5">
                  <div>
                    <p className="font-medium text-foreground">Free</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      15 questions on Gemini Flash, plus unlimited use with your own API keys.
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums">$0</span>
                </div>

                <div className="flex items-baseline justify-between gap-4 py-3.5">
                  <div>
                    <p className="font-medium text-foreground">Pro</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Full monthly usage across Google Pro, OpenAI, and Claude models without needing personal keys.
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-foreground tabular-nums">$8 / mo</span>
                </div>
              </div>

              {billing.authenticated && (
                <div className="space-y-2">
                  {billing.plan === 'free' ? (
                    <Button
                      onClick={() => {
                        trackEvent('checkout_click');
                        void startCheckout();
                      }}
                      disabled={actionLoading}
                      className="w-full gap-2"
                      data-testid="upgrade-to-pro-button"
                    >
                      {actionLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      Upgrade to Pro — $8/month
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={openBillingPortal}
                      disabled={actionLoading}
                      className="w-full gap-2"
                      data-testid="manage-subscription-button"
                    >
                      {actionLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      {billing.stripeConfigured ? 'Manage subscription in Stripe' : 'Switch back to Free'}
                    </Button>
                  )}
                  {!billing.stripeConfigured && (
                    <p className="text-center text-xs text-muted-foreground">
                      Demo checkout is active for local testing.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'api' && (
            <div role="tabpanel" id="settings-panel-api" aria-labelledby="settings-tab-api" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Add a key for any provider you want to use. Keys are sent only with your own requests and are never stored on the server.
              </p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="key-gemini">Google Gemini</Label>
                  <Input id="key-gemini" type="password" autoComplete="off" placeholder="AIza…" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="key-openai">OpenAI</Label>
                  <Input id="key-openai" type="password" autoComplete="off" placeholder="sk-…" value={openaiKey} onChange={e => setOpenaiKey(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="key-anthropic">Anthropic</Label>
                  <Input id="key-anthropic" type="password" autoComplete="off" placeholder="sk-ant-…" value={anthropicKey} onChange={e => setAnthropicKey(e.target.value)} />
                </div>
              </div>
              <Button onClick={handleSaveApiKeys} className="mt-2 w-full">Save keys</Button>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div role="tabpanel" id="settings-panel-appearance" aria-labelledby="settings-tab-appearance" className="space-y-6">
              <p className="text-sm text-muted-foreground">Pick your own colours. Changes apply as you choose them.</p>

              <div className="space-y-4">
                {COLOR_FIELDS.map(field => (
                  <div key={field.key} className="flex items-center justify-between gap-4">
                    <div>
                      <Label htmlFor={`color-${field.key}`} className="text-sm font-medium">{field.label}</Label>
                      <p id={`color-${field.key}-hint`} className="text-xs text-muted-foreground">{field.hint}</p>
                    </div>
                    <Input
                      id={`color-${field.key}`}
                      type="color"
                      aria-describedby={`color-${field.key}-hint`}
                      value={effective(field.key)}
                      onChange={(e) => updateColor(field.key, e.target.value)}
                      className="h-10 w-12 shrink-0 cursor-pointer p-1"
                    />
                  </div>
                ))}
              </div>

              <div role="status" aria-live="polite">
                {lowContrast.length > 0 && (
                  <div className="rounded-lg border border-destructive/40 px-4 py-3 text-sm">
                    <p className="font-semibold text-foreground">Some text may be hard to read</p>
                    <ul className="mt-1 space-y-0.5 text-muted-foreground">
                      {lowContrast.map(check => (
                        <li key={check.label}>
                          {check.label}: {check.ratio.toFixed(1)}:1 (aim for at least 4.5:1)
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-4">
                <Button variant="outline" onClick={resetColors} className="w-full gap-2">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Reset to default colours
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
