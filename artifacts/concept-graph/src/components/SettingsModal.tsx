import React, { useState, useEffect } from 'react';
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
import { useThemeCustomization } from '@/hooks/use-theme';
import { getCssVariableHex } from '@/lib/colors';

export function SettingsModal() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'api' | 'appearance'>('api');

  // API Keys state
  const [geminiKey, setGeminiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');

  // Appearance state
  const { colors, updateColor, resetColors } = useThemeCustomization();
  const [defaultHex, setDefaultHex] = useState({ primary: '#f97316', background: '#000000', secondaryBackground: '#1e293b', foreground: '#ffffff', secondaryForeground: '#94a3b8' });

  useEffect(() => {
    const existingGemini = window.localStorage.getItem('study-notebook-gemini-key') || window.localStorage.getItem('study-notebook-api-key');
    const existingOpenai = window.localStorage.getItem('study-notebook-openai-key');
    const existingAnthropic = window.localStorage.getItem('study-notebook-anthropic-key');
    
    if (existingGemini) setGeminiKey(existingGemini);
    if (existingOpenai) setOpenaiKey(existingOpenai);
    if (existingAnthropic) setAnthropicKey(existingAnthropic);
    
    const handleOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.tab) setActiveTab(detail.tab);
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
          secondaryForeground: getTrueDefault('--muted-foreground') 
        });
      setOpen(true);
    };
    
    window.addEventListener('open-settings', handleOpen);
    // Legacy fallback so we don't break existing buttons right away
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

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!val) setOpen(false);
    }}>
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden flex flex-col h-[500px]">
        
        {/* Header Tabs */}
        <div className="flex border-b border-border bg-muted/30 pt-4 px-4 gap-4">
          <button
            onClick={() => setActiveTab('api')}
            className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'api' 
                ? 'border-primary text-foreground' 
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Key className="w-4 h-4" />
            API Keys
          </button>
          <button
            onClick={() => setActiveTab('appearance')}
            className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'appearance' 
                ? 'border-primary text-foreground' 
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Paintbrush className="w-4 h-4" />
            Appearance
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'api' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold leading-none tracking-tight mb-2">AI Providers</h3>
                <p className="text-sm text-muted-foreground">
                  Configure one or more API keys to use different models. Keys are saved locally in your browser.
                </p>
              </div>
              <div className="space-y-3 mt-4">
                <div className="space-y-1">
                  <Label className="text-xs uppercase text-muted-foreground font-semibold">Google Gemini</Label>
                  <Input type="password" placeholder="AIza..." value={geminiKey} onChange={e => setGeminiKey(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs uppercase text-muted-foreground font-semibold">OpenAI</Label>
                  <Input type="password" placeholder="sk-..." value={openaiKey} onChange={e => setOpenaiKey(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs uppercase text-muted-foreground font-semibold">Anthropic Claude</Label>
                  <Input type="password" placeholder="sk-ant-..." value={anthropicKey} onChange={e => setAnthropicKey(e.target.value)} />
                </div>
              </div>
              <Button onClick={handleSaveApiKeys} className="w-full mt-4">Save Keys</Button>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold leading-none tracking-tight mb-2">Custom Colors</h3>
                <p className="text-sm text-muted-foreground">
                  Personalize your workspace. These changes apply instantly.
                </p>
              </div>

              <div className="space-y-5">
                {/* Primary Color Picker */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Primary Accent</Label>
                    <p className="text-xs text-muted-foreground">Main buttons and highlights.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input 
                      type="color" 
                      value={colors.primary || defaultHex.primary} 
                      onChange={(e) => updateColor('primary', e.target.value)}
                      className="w-12 h-10 p-1 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Background Color Picker */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">App Background</Label>
                    <p className="text-xs text-muted-foreground">The main canvas color.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input 
                      type="color" 
                      value={colors.background || defaultHex.background} 
                      onChange={(e) => updateColor('background', e.target.value)}
                      className="w-12 h-10 p-1 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Secondary Background Color Picker */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Secondary Background</Label>
                    <p className="text-xs text-muted-foreground">Chat boxes, sidebars, and panels.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input 
                      type="color" 
                      value={colors.secondaryBackground || defaultHex.secondaryBackground} 
                      onChange={(e) => updateColor('secondaryBackground', e.target.value)}
                      className="w-12 h-10 p-1 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Secondary Foreground Color Picker */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Secondary Text</Label>
                    <p className="text-xs text-muted-foreground">Muted text, citations, and inactive tabs.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input 
                      type="color" 
                      value={colors.secondaryForeground || defaultHex.secondaryForeground} 
                      onChange={(e) => updateColor('secondaryForeground', e.target.value)}
                      className="w-12 h-10 p-1 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Foreground Color Picker */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Text Color</Label>
                    <p className="text-xs text-muted-foreground">Primary text and icons.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input 
                      type="color" 
                      value={colors.foreground || defaultHex.foreground} 
                      onChange={(e) => updateColor('foreground', e.target.value)}
                      className="w-12 h-10 p-1 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-border mt-6">
                <Button variant="outline" onClick={resetColors} className="w-full gap-2">
                  <RotateCcw className="w-4 h-4" />
                  Reset to Defaults
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}







