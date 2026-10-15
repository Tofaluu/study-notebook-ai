import type { ProviderAdapter } from "./types";

type OpenAIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

export const openai: ProviderAdapter = {
  id: "openai",
  displayName: "OpenAI",
  apiKeyHeader: "x-openai-api-key",

  buildRequest({ prompt, schema, model, apiKey, images }) {
    const content: OpenAIContentPart[] = [{ type: "text", text: prompt }];
    for (const image of images) {
      content.push({ type: "text", text: "Attached Image: " + image.name });
      content.push({ type: "image_url", image_url: { url: image.data } });
    }

    return {
      url: "https://api.openai.com/v1/chat/completions",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: {
        model,
        messages: [{ role: "user", content }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "response",
            strict: true,
            schema: { ...schema, additionalProperties: false },
          },
        },
      },
    };
  },

  extractText(payload) {
    return (payload as ChatCompletionResponse).choices?.[0]?.message?.content ?? undefined;
  },
};
