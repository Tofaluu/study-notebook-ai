import type { LectureSource } from "@workspace/api-zod";
import type { ImageInput, JsonSchema } from "./types";

export const MAX_SOURCE_CHARS = 180_000;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stripDataUrlPrefix(data: string): string {
  return data.includes(",") ? data.split(",")[1] : data;
}

export function stripAdditionalProperties(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(stripAdditionalProperties);
  if (!isObject(schema)) return schema;
  const { additionalProperties: _ignored, ...rest } = schema as JsonSchema;
  return Object.fromEntries(
    Object.entries(rest).map(([key, value]) => [key, stripAdditionalProperties(value)]),
  );
}

/**
 * Repairs the most common ways models drift from the requested shape (missing
 * arrays, wrong types, or echoing the JSON schema itself instead of an
 * instance) so the strict Zod response parse that follows succeeds.
 */
export function normalizeExplanation(raw: unknown): unknown {
  if (!isObject(raw)) return raw;

  // The model hallucinated the JSON schema definition instead of the instance
  if (isObject(raw.properties) && raw.type === "object") {
    const props = raw.properties;
    if (isObject(props.title) && props.title.type === "string") raw.title = "Response";
    else if (typeof props.title === "string") raw.title = props.title;

    if (typeof props.answerMarkdown === "string") raw.answerMarkdown = props.answerMarkdown;
    else if (isObject(props.answerMarkdown) && props.answerMarkdown.description) {
      raw.answerMarkdown = "Model hallucinated schema definition.";
    }

    if (Array.isArray(props.terms)) raw.terms = props.terms;
    if (Array.isArray(props.sourceRefs)) raw.sourceRefs = props.sourceRefs;
  }

  for (const key of ["terms", "sourceRefs", "prerequisiteTerms"]) {
    if (!Array.isArray(raw[key])) raw[key] = [];
  }

  if (typeof raw.title !== "string") raw.title = "Study Explanation";
  if (typeof raw.answerMarkdown !== "string") raw.answerMarkdown = "No explanation provided.";

  return raw;
}

/**
 * Flattens lecture sources into page-tagged blocks so the model can cite
 * `[SOURCE id | name | PAGE n]`, truncating at MAX_SOURCE_CHARS overall.
 */
export function formatSources(
  sources: Array<Pick<LectureSource, "id" | "name" | "pages">>,
  maxChars = MAX_SOURCE_CHARS,
): string {
  let remaining = maxChars;
  const blocks: string[] = [];

  for (const source of sources) {
    for (const page of source.pages) {
      const header = `\n[SOURCE ${source.id} | ${source.name} | PAGE ${page.pageNumber}]\n`;
      // Stop before a page whose header alone would exceed the budget
      if (remaining <= header.length) {
        remaining = 0;
        break;
      }
      const text = page.text.slice(0, Math.max(0, remaining - header.length));
      blocks.push(`${header}${text}`);
      remaining -= header.length + text.length;
    }
    if (remaining <= 0) break;
  }
  return blocks.join("\n");
}

export function imagesFromSources(sources: LectureSource[]): ImageInput[] {
  return sources
    .filter((source) => source.type === "image" && source.base64Data)
    .map((source) => ({
      name: source.name,
      mimeType: source.mimeType || "image/jpeg",
      data: source.base64Data as string,
    }));
}

export function getErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (
    msg.includes("API_KEY_INVALID") ||
    msg.includes("API key not valid") ||
    msg.includes("PERMISSION_DENIED") ||
    msg.includes("401") ||
    msg.includes("403")
  ) {
    return "The provided API key is invalid or unauthorized. Please verify your API key and update it in the API Key Settings.";
  }
  if (msg.includes("400")) {
    return `Bad Request (400) from AI provider: ${msg}`;
  }
  if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
    return "Quota or rate limit exceeded for this API key. Please check your usage limits or try again in a few moments.";
  }
  return `An error occurred while communicating with the AI provider: ${msg}`;
}
