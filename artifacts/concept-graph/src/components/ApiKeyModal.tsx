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

export function ApiKeyModal() {
  const [open, setOpen] = useState(false);
  const [geminiKey, setGeminiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');

  useEffect(() => {
    const existingGemini = window.localStorage.getItem('study-notebook-gemini-key') || window.localStorage.getItem('study-notebook-api-key');
    const existingOpenai = window.localStorage.getItem('study-notebook-openai-key');
    const existingAnthropic = window.localStorage.getItem('study-notebook-anthropic-key');
    
    if (existingGemini) setGeminiKey(existingGemini);
    if (existingOpenai) setOpenaiKey(existingOpenai);
    if (existingAnthropic) setAnthropicKey(existingAnthropic);
    
    // Only auto-open if absolutely no keys are configured
    if (!existingGemini && !existingOpenai && !existingAnthropic) {
      setOpen(true);
    }

    const handleOpen = () => {
      setGeminiKey(window.localStorage.getItem('study-notebook-gemini-key') || window.localStorage.getItem('study-notebook-api-key') || '');
      setOpenaiKey(window.localStorage.getItem('study-notebook-openai-key') || '');
      setAnthropicKey(window.localStorage.getItem('study-notebook-anthropic-key') || '');
      setOpen(true);
    };
    window.addEventListener('open-api-key-modal', handleOpen);
    return () => window.removeEventListener('open-api-key-modal', handleOpen);
  }, []);

  const handleSave = () => {
    if (geminiKey.trim()) window.localStorage.setItem('study-notebook-gemini-key', geminiKey.trim());
    else window.localStorage.removeItem('study-notebook-gemini-key');

    if (openaiKey.trim()) window.localStorage.setItem('study-notebook-openai-key', openaiKey.trim());
    else window.localStorage.removeItem('study-notebook-openai-key');

    if (anthropicKey.trim()) window.localStorage.setItem('study-notebook-anthropic-key', anthropicKey.trim());
    else window.localStorage.removeItem('study-notebook-anthropic-key');

    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => {
        const hasAnyKey = window.localStorage.getItem('study-notebook-gemini-key') || window.localStorage.getItem('study-notebook-api-key') || window.localStorage.getItem('study-notebook-openai-key') || window.localStorage.getItem('study-notebook-anthropic-key');
        if (!hasAnyKey) {
          e.preventDefault();
        }
      }}>
        <DialogHeader>
          <DialogTitle>API Key Settings</DialogTitle>
          <DialogDescription>
            Configure one or more API keys to use different models. Keys are saved locally in your browser.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 mt-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase text-muted-foreground">Google Gemini Key</label>
            <Input
              type="password"
              placeholder="AIza..."
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase text-muted-foreground">OpenAI Key</label>
            <Input
              type="password"
              placeholder="sk-..."
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase text-muted-foreground">Anthropic Key</label>
            <Input
              type="password"
              placeholder="sk-ant-..."
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
            />
          </div>
          <Button type="submit" onClick={handleSave} className="w-full mt-2">
            Save Keys
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
