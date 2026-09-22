import type { StudyModel } from '@workspace/api-client-react';

export const DEFAULT_STUDY_MODEL: StudyModel = 'gemini-3.7-flash';

export const STUDY_MODEL_OPTIONS: Array<{ value: StudyModel; label: string; provider: string }> = [
  { value: 'gemini-3.1-flash-lite', label: '3.1 Flash Lite', provider: 'Google' },
  { value: 'gemini-3.7-flash', label: '3.7 Flash', provider: 'Google' },
  { value: 'gemini-3.1-pro', label: '3.1 Pro', provider: 'Google' },
  { value: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', provider: 'OpenAI' },
  { value: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', provider: 'OpenAI' },
  { value: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', provider: 'OpenAI' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', provider: 'Anthropic' },
  { value: 'claude-sonnet-5', label: 'Claude Sonnet 5', provider: 'Anthropic' },
  { value: 'claude-fable-5-1', label: 'Claude Fable 5.1', provider: 'Anthropic' },
  { value: 'claude-opus-5', label: 'Claude Opus 5', provider: 'Anthropic' },
];

export function isStudyModel(value: string | null): value is StudyModel {
  return STUDY_MODEL_OPTIONS.some(option => option.value === value);
}
