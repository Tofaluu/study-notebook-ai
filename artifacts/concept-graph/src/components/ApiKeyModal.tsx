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
  const [key, setKey] = useState('');

  useEffect(() => {
    const existingKey = window.localStorage.getItem('study-notebook-api-key');
    if (existingKey) {
      setKey(existingKey);
    } else {
      setOpen(true);
    }
    const handleOpen = () => {
      setKey(window.localStorage.getItem('study-notebook-api-key') || '');
      setOpen(true);
    };
    window.addEventListener('open-api-key-modal', handleOpen);
    return () => window.removeEventListener('open-api-key-modal', handleOpen);
  }, []);

  const handleSave = () => {
    if (key.trim()) {
      window.localStorage.setItem('study-notebook-api-key', key.trim());
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => {
        // Prevent closing if key is still missing
        if (!window.localStorage.getItem('study-notebook-api-key')) {
          e.preventDefault();
        }
      }}>
        <DialogHeader>
          <DialogTitle>Welcome to Study Notebook</DialogTitle>
          <DialogDescription>
            Please provide your Gemini API key to continue. This key is saved locally in your browser.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center space-x-2 mt-4">
          <Input
            type="password"
            placeholder="Paste Gemini Key Here"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
          />
          <Button type="submit" onClick={handleSave} disabled={!key.trim()}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
