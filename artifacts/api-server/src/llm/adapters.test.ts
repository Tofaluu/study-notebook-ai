import { describe, expect, it } from "vitest";
import { anthropic } from "./anthropic";
import { gemini } from "./gemini";
import { openai } from "./openai";
import type { StructuredRequest } from "./types";

const schema = {
  type: "object",
  properties: {
    title: { type: "string" },
    nested: { type: "object", properties: { a: { type: "string" } }, additionalProperties: false },
  },
  required: ["title"],
  additionalProperties: false,
};

const request: StructuredRequest = {
  prompt: "Explain recursion",
  schema,
  model: "test-model",
  apiKey: "secret/key+1",
  images: [{ name: "diagram.png", mimeType: "image/png", data: "data:image/png;base64,QUJD" }],
};

describe("openai adapter", () => {
  it("requests strict json_schema output with the bearer key", () => {
    const { url, headers, body } = openai.buildRequest(request);
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(headers.Authorization).toBe("Bearer secret/key+1");
    expect(body).toMatchObject({
      model: "test-model",
      response_format: {
        type: "json_schema",
        json_schema: { strict: true, schema: { additionalProperties: false } },
      },
    });
  });

  it("sends images as data URLs alongside a caption", () => {
    const { body } = openai.buildRequest(request);
    const content = (body as { messages: Array<{ content: unknown[] }> }).messages[0].content;
    expect(content).toEqual([
      { type: "text", text: "Explain recursion" },
      { type: "text", text: "Attached Image: diagram.png" },
      { type: "image_url", image_url: { url: "data:image/png;base64,QUJD" } },
    ]);
  });

  it("extracts the message content", () => {
    expect(openai.extractText({ choices: [{ message: { content: '{"title":"x"}' } }] })).toBe('{"title":"x"}');
    expect(openai.extractText({ choices: [] })).toBeUndefined();
  });
});

describe("anthropic adapter", () => {
  it("enforces the schema through a single tool and strips the data URL prefix", () => {
    const { url, headers, body } = anthropic.buildRequest(request);
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(headers["x-api-key"]).toBe("secret/key+1");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(body).toMatchObject({
      tools: [{ name: "output_response", input_schema: schema }],
      messages: [
        {
          content: [
            { type: "text", text: "Explain recursion" },
            { type: "text", text: "Attached Image: diagram.png" },
            { type: "image", source: { type: "base64", media_type: "image/png", data: "QUJD" } },
          ],
        },
      ],
    });
  });

  it("returns the tool input as JSON text", () => {
    const text = anthropic.extractText({ content: [{ type: "tool_use", input: { title: "Recursion" } }] });
    expect(JSON.parse(text!)).toEqual({ title: "Recursion" });
  });

  it("wraps a plain-text reply when the model skips the tool", () => {
    const text = anthropic.extractText({ content: [{ type: "text", text: "Hello!" }] });
    expect(JSON.parse(text!)).toEqual({ title: "Response", answerMarkdown: "Hello!", terms: [], sourceRefs: [] });
  });

  it("surfaces API errors and empty responses", () => {
    expect(() => anthropic.extractText({ error: { message: "overloaded" } })).toThrow("Anthropic API Error: overloaded");
    expect(() => anthropic.extractText({ content: [] })).toThrow("API returned an empty response");
  });
});

describe("gemini adapter", () => {
  it("URL-encodes the key and removes additionalProperties from the schema", () => {
    const { url, body } = gemini.buildRequest(request);
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent?key=secret%2Fkey%2B1",
    );
    const responseSchema = (body as { generationConfig: { responseSchema: unknown } }).generationConfig.responseSchema;
    expect(JSON.stringify(responseSchema)).not.toContain("additionalProperties");
    expect(responseSchema).toMatchObject({ required: ["title"], properties: { nested: { type: "object" } } });
  });

  it("sends images as inline base64 data", () => {
    const { body } = gemini.buildRequest(request);
    const parts = (body as { contents: Array<{ parts: unknown[] }> }).contents[0].parts;
    expect(parts[2]).toEqual({ inlineData: { mimeType: "image/png", data: "QUJD" } });
  });

  it("extracts the first candidate's text", () => {
    expect(gemini.extractText({ candidates: [{ content: { parts: [{ text: "{}" }] } }] })).toBe("{}");
    expect(gemini.extractText({})).toBeUndefined();
  });
});
