import { useEffect, useState } from 'react';
import type { StudyModel } from '@workspace/api-client-react';
import { STUDY_MODEL_OPTIONS } from '@/lib/models';
import { useBilling } from '@/hooks/use-billing';
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

/** Picks the model new questions use; models unlocked via BYOK or the user's active plan are selectable. */
export function ModelPicker({ value, onChange }: ModelPickerProps) {
  const { status: billing } = useBilling();
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

  const hasAnyByok = keys.gemini || keys.openai || keys.anthropic;
  const hasServerAccess = billing.authenticated && billing.remaining > 0;

  if (!hasAnyByok && !hasServerAccess) {
    return (
      <button
        type="button"
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent('open-settings', {
              detail: { tab: billing.authenticated ? 'plan' : 'api' },
            }),
          )
        }
        className="h-7 shrink-0 whitespace-nowrap rounded-md px-2 text-xs font-medium [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:px-3 text-foreground transition-[transform,background-color] duration-150 ease-out hover:bg-muted active:scale-95"
      >
        {billing.authenticated ? 'Upgrade or add key' : 'Add API key'}
      </button>
    );
  }

  const isModelUnlocked = (providerKey: 'gemini' | 'openai' | 'anthropic', modelValue: StudyModel): boolean => {
    if (keys[providerKey]) return true;
    if (!hasServerAccess) return false;
    if (billing.plan === 'pro') return true;
    return billing.freeEligibleModels.includes(modelValue);
  };

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
            {STUDY_MODEL_OPTIONS.filter((o) => o.provider === provider.name).map((option) => {
              const unlocked = isModelUnlocked(provider.key, option.value);
              const showProBadge = !unlocked && billing.authenticated && billing.plan === 'free';
              return (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  disabled={!unlocked}
                  className="focus:bg-foreground/5 focus:text-foreground cursor-pointer text-xs disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <span className="inline-flex items-center gap-2">
                    <span>{option.label}</span>
                    {showProBadge && (
                      <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs font-medium text-primary">
                        Pro
                      </span>
                    )}
                  </span>
                </SelectItem>
              );
            })}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
