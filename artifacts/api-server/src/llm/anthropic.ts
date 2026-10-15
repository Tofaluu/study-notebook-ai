import type { ProviderAdapter } from "./types";
import { stripDataUrlPrefix } from "./normalize";

const SYSTEM_PROMPT =
  "You must use the provided tool to output your response. IMPORTANT: Never generate XML or HTML tags inside the JSON strings. The 'terms' must be placed inside the proper JSON array, NOT hallucinated as XML tags inside the answerMarkdown string.";

type AnthropicContentPart =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

interface MessagesResponse {
  error?: { message?: string };
  content?: Array<{ type: string; text?: string; input?: unknown }>;
}

export const anthropic: ProviderAdapter = {
  id: "anthropic",
  displayName: "Anthropic",
  apiKeyHeader: "x-anthropic-api-key",

  buildRequest({ prompt, schema, model, apiKey, images }) {
    const content: AnthropicContentPart[] = [{ type: "text", text: prompt }];
    for (const image of images) {
      content.push({ type: "text", text: "Attached Image: " + image.name });
      content.push({
        type: "image",
        source: { type: "base64", media_type: image.mimeType, data: stripDataUrlPrefix(image.data) },
      });
    }

    return {
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: {
        model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
        // Anthropic has no JSON-schema response mode, so the schema is enforced
        // as the input of a single tool the model is asked to call.
        tools: [
          {
            name: "output_response",
            description: "Output the structured response",
            input_schema: schema,
          },
        ],
        tool_choice: { type: "auto" },
      },
    };
  },

  extractText(payload) {
    const response = payload as MessagesResponse;
    if (response.error) {
      throw new Error(`Anthropic API Error: ${response.error.message}`);
    }

    const toolCall = response.content?.find((block) => block.type === "tool_use");
    if (toolCall) return JSON.stringify(toolCall.input);

    // If the model ignored the tool and answered conversationally, wrap the text gracefully
    const textBlock = response.content?.find((block) => block.type === "text");
    if (textBlock?.text) {
      return JSON.stringify({
        title: "Response",
        answerMarkdown: textBlock.text,
        terms: [],
        sourceRefs: [],
      });
    }

    throw new Error("API returned an empty response. Payload was: " + JSON.stringify(payload));
  },
};
