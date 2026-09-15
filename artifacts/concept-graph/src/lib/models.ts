import type { StudyModel } from '@workspace/api-client-react';

export const DEFAULT_STUDY_MODEL: StudyModel = 'gemini-3.7-flash';

export const STUDY_MODEL_OPTIONS: Array<{ value: StudyModel; label: string }> = [
  { value: 'gemini-3.1-flash-lite', label: '3.1 Flash Lite' },
  { value: 'gemini-3.7-flash', label: '3.7 Flash' },
  { value: 'gemini-3.1-pro-preview', label: '3.1 Pro' },
];

export function isStudyModel(value: string | null): value is StudyModel {
  return STUDY_MODEL_OPTIONS.some(option => option.value === value);
}