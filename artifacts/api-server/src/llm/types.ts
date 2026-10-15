export type JsonSchema = Record<string, unknown>;

export interface ImageInput {
  name: string;
  mimeType: string;
  /** Base64 payload, optionally prefixed with a `data:<mime>;base64,` header. */
  data: string;
}

export interface StructuredRequest {
  prompt: string;
  schema: JsonSchema;
  model: string;
  apiKey: string;
  images: ImageInput[];
}

export interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Each LLM vendor exposes structured output differently (OpenAI json_schema,
 * Anthropic tool input, Gemini responseSchema). An adapter hides those
 * differences behind one request/response contract.
 */
export interface ProviderAdapter {
  id: "openai" | "anthropic" | "gemini";
  displayName: string;
  /** Request header the browser uses to forward the user's own key. */
  apiKeyHeader: string;
  buildRequest(request: StructuredRequest): ProviderRequest;
  /** Returns the JSON text of the structured response, or undefined if empty. */
  extractText(payload: unknown): string | undefined;
}
