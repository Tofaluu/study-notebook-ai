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
import { Key, Paintbrush, RotateCcw } from 'lucide-react';
import { useThemeCustomization, type ThemeColors } from '@/hooks/use-theme';
import { contrastRatio, getCssVariableHex } from '@/lib/colors';

type SettingsTab = 'api' | 'appearance';

const COLOR_FIELDS: { key: keyof ThemeColors; label: string; hint: string }[] = [
  { key: 'primary', label: 'Accent', hint: 'Buttons, links and underlined terms.' },
  { key: 'background', label: 'Background', hint: 'The main page behind your notes.' },
  { key: 'secondaryBackground', label: 'Panels', hint: 'Answer cards, the sidebar and menus.' },
  { key: 'foreground', label: 'Text', hint: 'Body text and icons.' },
  { key: 'secondaryForeground', label: 'Secondary text', hint: 'Hints, citations and inactive tabs.' },
];

export function SettingsModal() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>('api');
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const [geminiKey, setGeminiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');

  const { colors, updateColor, resetColors } = useThemeCustomization();
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
      if (detail?.tab) setActiveTab(detail.tab);
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
  }, []);

  const handleSaveApiKeys = () => {
    if (geminiKey.trim()) window.localStorage.setItem('study-notebook-gemini-key', geminiKey.trim());
    else window.localStorage.removeItem('study-notebook-gemini-key');

    if (openaiKey.trim()) window.localStorage.setItem('study-notebook-openai-key', openaiKey.trim());
    else window.localStorage.removeItem('study-notebook-openai-key');

    if (anthropicKey.trim()) window.localStorage.setItem('study-notebook-anthropic-key', anthropicKey.trim());
    else window.localStorage.removeItem('study-notebook-anthropic-key');

    setOpen(false);
    window.dispatchEvent(new Event('api-keys-updated'));
  };

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
      className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors ${
        activeTab === tab ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) setOpen(false); }}>
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

        <div role="tablist" aria-label="Settings sections" className="flex gap-4 border-b border-border px-6 pt-2">
          {tabButton('api', 'API keys', Key)}
          {tabButton('appearance', 'Appearance', Paintbrush)}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
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
