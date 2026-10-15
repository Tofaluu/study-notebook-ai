import { anthropic } from "./anthropic";
import { gemini } from "./gemini";
import { openai } from "./openai";
import type { ProviderAdapter, StructuredRequest } from "./types";

export const DEFAULT_MODEL = "gemini-3.8-flash";
const REQUEST_TIMEOUT_MS = 90_000;

export function resolveProvider(model: string = DEFAULT_MODEL): ProviderAdapter {
  if (model.startsWith("gpt-")) return openai;
  if (model.startsWith("claude-")) return anthropic;
  return gemini;
}

/**
 * Sends one structured-output request to whichever provider serves `model`
 * and returns the parsed JSON. Provider-specific details live in the adapters.
 */
export async function generateStructured(
  request: StructuredRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const provider = resolveProvider(request.model);
  const { url, headers, body } = provider.buildRequest(request);

  const response = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`API request failed (${response.status}): ${detail}`);
  }

  const text = provider.extractText(await response.json());
  if (!text) throw new Error("API returned an empty response");

  return JSON.parse(text);
}
