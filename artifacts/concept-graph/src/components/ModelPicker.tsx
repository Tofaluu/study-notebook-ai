import { useEffect, useState } from 'react';
import type { StudyModel } from '@workspace/api-client-react';
import { DEFAULT_STUDY_MODEL, STUDY_MODEL_OPTIONS } from '@/lib/models';
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

type ProviderKey = (typeof PROVIDERS)[number]['key'];

function providerKeyForName(name: string): ProviderKey {
  if (name === 'OpenAI') return 'openai';
  if (name === 'Anthropic') return 'anthropic';
  return 'gemini';
}

function readStoredKeys() {
  if (typeof window === 'undefined') {
    return { gemini: false, openai: false, anthropic: false };
  }
  return {
    gemini: !!(window.localStorage.getItem('study-notebook-gemini-key') || window.localStorage.getItem('study-notebook-api-key')),
    openai: !!window.localStorage.getItem('study-notebook-openai-key'),
    anthropic: !!window.localStorage.getItem('study-notebook-anthropic-key'),
  };
}

/** Picks the model new questions use; models unlocked via BYOK or the user's active plan are selectable. */
export function ModelPicker({ value, onChange }: ModelPickerProps) {
  const { status: billing, loading: billingLoading } = useBilling();
  const [keys, setKeys] = useState(readStoredKeys);

  useEffect(() => {
    const checkKeys = () => setKeys(readStoredKeys());
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

  const isModelUnlocked = (providerKey: ProviderKey, modelValue: StudyModel): boolean => {
    if (keys[providerKey]) return true;
    if (!hasServerAccess) return false;
    if (!billing.serverKeysConfigured[providerKey]) return false;
    if (billing.plan === 'pro') return true;
    return billing.freeEligibleModels.includes(modelValue);
  };

  // Prevent stale Pro/Anthropic/OpenAI models in localStorage from sticking when logged out or without that provider's key
  useEffect(() => {
    if (billingLoading) return;
    if (!hasAnyByok && !hasServerAccess) {
      if (value !== DEFAULT_STUDY_MODEL) {
        onChange(DEFAULT_STUDY_MODEL);
      }
      return;
    }
    const currentOption = STUDY_MODEL_OPTIONS.find((option) => option.value === value);
    const currentUnlocked = currentOption
      ? isModelUnlocked(providerKeyForName(currentOption.provider), currentOption.value)
      : false;
    if (currentUnlocked) return;

    const unlockedOptions = STUDY_MODEL_OPTIONS.filter((option) =>
      isModelUnlocked(providerKeyForName(option.provider), option.value),
    );
    const fallback =
      unlockedOptions.find((option) => option.value === DEFAULT_STUDY_MODEL)?.value ??
      unlockedOptions[0]?.value ??
      DEFAULT_STUDY_MODEL;
    if (fallback !== value) {
      onChange(fallback);
    }
  }, [billingLoading, hasAnyByok, hasServerAccess, value, onChange, keys, billing]);

  if (!hasAnyByok && !hasServerAccess) {
    return (
      <button
        type="button"
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent('open-settings', {
              detail: { tab: 'plan' },
            }),
          )
        }
        className="h-7 shrink-0 whitespace-nowrap rounded-md px-2 text-xs font-medium [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:px-3 text-foreground transition-[transform,background-color] duration-150 ease-out hover:bg-muted active:scale-95"
      >
        {billing.authenticated ? 'Upgrade or add key' : 'Sign up or add key'}
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
