import type { ProviderAdapter } from "./types";
import { stripAdditionalProperties, stripDataUrlPrefix } from "./normalize";

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

interface GenerateContentResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

export const gemini: ProviderAdapter = {
  id: "gemini",
  displayName: "Google Gemini",
  apiKeyHeader: "x-gemini-api-key",

  buildRequest({ prompt, schema, model, apiKey, images }) {
    const parts: GeminiPart[] = [{ text: prompt }];
    for (const image of images) {
      parts.push({ text: "Attached Image: " + image.name });
      parts.push({ inlineData: { mimeType: image.mimeType, data: stripDataUrlPrefix(image.data) } });
    }

    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: {
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0.25,
          responseMimeType: "application/json",
          // Gemini's responseSchema rejects the additionalProperties keyword
          responseSchema: stripAdditionalProperties(schema),
        },
      },
    };
  },

  extractText(payload) {
    return (payload as GenerateContentResponse).candidates?.[0]?.content?.parts?.[0]?.text;
  },

  extractUsage(payload) {
    const meta = (payload as GenerateContentResponse).usageMetadata;
    if (!meta) return undefined;
    return {
      inputTokens: typeof meta.promptTokenCount === "number" ? meta.promptTokenCount : 0,
      outputTokens: typeof meta.candidatesTokenCount === "number" ? meta.candidatesTokenCount : 0,
    };
  },
};
