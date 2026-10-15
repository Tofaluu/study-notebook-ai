import type { ProviderAdapter } from "./types";
import { stripAdditionalProperties, stripDataUrlPrefix } from "./normalize";

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

interface GenerateContentResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
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
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      headers: { "Content-Type": "application/json" },
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
};
