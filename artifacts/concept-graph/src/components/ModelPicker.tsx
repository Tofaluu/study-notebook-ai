import { useEffect, useState } from 'react';
import type { StudyModel } from '@workspace/api-client-react';
import { STUDY_MODEL_OPTIONS } from '@/lib/models';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ModelPickerProps {
  value: StudyModel;
  onChange: (model: StudyModel) => void;
}

const PROVIDERS = [
  { name: 'Google', key: 'gemini' },
  { name: 'OpenAI', key: 'openai' },
  { name: 'Anthropic', key: 'anthropic' },
] as const;

/** Picks the model new questions use; models whose provider has no saved key are greyed out. */
export function ModelPicker({ value, onChange }: ModelPickerProps) {
  const [keys, setKeys] = useState({ gemini: false, openai: false, anthropic: false });
  useEffect(() => {
    const checkKeys = () => {
      setKeys({
        gemini: !!(window.localStorage.getItem('study-notebook-gemini-key') || window.localStorage.getItem('study-notebook-api-key')),
        openai: !!window.localStorage.getItem('study-notebook-openai-key'),
        anthropic: !!window.localStorage.getItem('study-notebook-anthropic-key'),
      });
    };
    checkKeys();
    window.addEventListener('storage', checkKeys);
    window.addEventListener('api-keys-updated', checkKeys);
    return () => {
      window.removeEventListener('storage', checkKeys);
      window.removeEventListener('api-keys-updated', checkKeys);
    };
  }, []);

  if (!keys.gemini && !keys.openai && !keys.anthropic) {
    return (
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'api' } }))}
        className="h-7 shrink-0 whitespace-nowrap rounded-md px-2 text-xs font-medium [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:px-3 text-foreground transition-[transform,background-color] duration-150 ease-out hover:bg-muted active:scale-95"
      >
        Add API key
      </button>
    );
  }

  return (
    <Select value={value} onValueChange={(next) => onChange(next as StudyModel)}>
      <SelectTrigger
        aria-label="Model"
        className="h-7 w-auto shrink-0 gap-1.5 rounded-md border-0 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:px-3 bg-transparent px-2 text-xs font-medium text-muted-foreground shadow-none transition-colors hover:bg-muted hover:text-foreground focus:ring-0"
      >
        <SelectValue placeholder="Select model" />
      </SelectTrigger>
      <SelectContent side="top" align="start">
        {PROVIDERS.map((provider, index) => (
          <SelectGroup key={provider.name}>
            <SelectLabel className={`text-xs text-muted-foreground ${index > 0 ? 'mt-1' : ''}`}>{provider.name}</SelectLabel>
            {STUDY_MODEL_OPTIONS.filter((o) => o.provider === provider.name).map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                disabled={!keys[provider.key]}
                className="focus:bg-foreground/5 focus:text-foreground cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
