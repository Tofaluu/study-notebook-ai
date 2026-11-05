import { describe, expect, it } from "vitest";
import * as schemas from "./schemas";

// OpenAI's strict structured output rejects an object schema unless it sets additionalProperties to false and lists
// every property in `required`. Gemini and Claude accept looser schemas, so a schema that breaks the rule only shows up
// as OpenAI failing; routes that catch errors then hide it. This walks every exported schema so that can't recur.
function problems(node: unknown, path: string): string[] {
  if (!node || typeof node !== "object") return [];
  const schema = node as Record<string, unknown>;
  const found: string[] = [];

  if (schema.type === "object" && schema.properties) {
    const keys = Object.keys(schema.properties as object);
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
    const missing = keys.filter((key) => !required.includes(key));
    if (missing.length > 0) found.push(`${path}: not in required: ${missing.join(", ")}`);
    if (schema.additionalProperties !== false) found.push(`${path}: additionalProperties must be false`);
    for (const [key, child] of Object.entries(schema.properties as object)) found.push(...problems(child, `${path}.${key}`));
  }
  if (schema.items) found.push(...problems(schema.items, `${path}[]`));
  return found;
}

describe("structured-output schemas", () => {
  for (const [name, schema] of Object.entries(schemas)) {
    it(`${name} satisfies OpenAI strict mode`, () => {
      expect(problems(schema, name)).toEqual([]);
    });
  }
});
