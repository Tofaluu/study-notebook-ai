import { Router, type IRouter } from "express";
import {
  ExplainStudyTopicBody,
  ExplainStudyTopicResponse,
  ExplainTechnicalConceptBody,
  ExplainTechnicalConceptResponse,
  ExplainSelectedPassageBody,
  ExplainSelectedPassageResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const DEFAULT_MODEL = "gemini-3.7-flash";
const MAX_SOURCE_CHARS = 180_000;

type JsonSchema = Record<string, unknown>;

const pageReferenceSchema = {
  type: "object",
  properties: {
    sourceId: { type: "string" },
    sourceName: { type: "string" },
    pageNumber: { type: "integer" },
    excerpt: { type: "string" },
  },
  required: ["sourceId", "sourceName", "pageNumber", "excerpt"],
};

const studyExplanationSchema: JsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    answerMarkdown: { type: "string" },
    terms: {
      type: "array",
      items: {
        type: "object",
        properties: {
          term: { type: "string" },
          contextSnippet: { type: "string" },
          plainDefinition: { type: "string" },
        },
        required: ["term", "contextSnippet", "plainDefinition"],
      },
    },
    sourceRefs: { type: "array", items: pageReferenceSchema },
  },
  required: ["title", "answerMarkdown", "terms", "sourceRefs"],
};

const technicalConceptSchema: JsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    answerMarkdown: { type: "string" },
    prerequisiteTerms: { type: "array", items: { type: "string" } },
    sourceRefs: { type: "array", items: pageReferenceSchema },
  },
  required: ["title", "answerMarkdown", "prerequisiteTerms", "sourceRefs"],
};

const selectedPassageSchema: JsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    answerMarkdown: { type: "string" },
    terms: {
      type: "array",
      items: {
        type: "object",
        properties: {
          term: { type: "string" },
          contextSnippet: { type: "string" },
          plainDefinition: { type: "string" },
        },
        required: ["term", "contextSnippet", "plainDefinition"],
      },
    },
    sourceRefs: { type: "array", items: pageReferenceSchema },
  },
  required: ["title", "answerMarkdown", "terms", "sourceRefs"],
};

async function generateStructured(
  prompt: string,
  responseSchema: JsonSchema,
  model: string = DEFAULT_MODEL,
  req?: any // Pass the express request to get headers easily
): Promise<unknown> {
  const isOpenAI = model.startsWith("gpt-");
  const isAnthropic = model.startsWith("claude-");
  
  let apiKey = req?.get("x-gemini-api-key")?.trim();
  if (isOpenAI) apiKey = req?.get("x-openai-api-key")?.trim();
  if (isAnthropic) apiKey = req?.get("x-anthropic-api-key")?.trim();

  let url, headers, body, extractText;

  if (isOpenAI) {
    url = "https://api.openai.com/v1/chat/completions";
    headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    };
    body = {
      model,
      temperature: 0.25,
      messages: [{ role: "user", content: prompt }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "response",
          strict: true,
          schema: { ...responseSchema, additionalProperties: false }
        }
      }
    };
    extractText = (payload: any) => payload.choices?.[0]?.message?.content;
  } else if (isAnthropic) {
    url = "https://api.anthropic.com/v1/messages";
    headers = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    };
    body = {
      model,
      max_tokens: 4096,
      system: "You must use the provided tool to output the response in the requested format.",
      messages: [{ role: "user", content: prompt }],
      tools: [{
        name: "output_response",
        description: "Output the structured response",
        input_schema: responseSchema
      }],
      tool_choice: { type: "auto" }
    };
    extractText = (payload: any) => {
      const toolCall = payload.content?.find((c: any) => c.type === "tool_use");
      return toolCall ? JSON.stringify(toolCall.input) : null;
    };
  } else {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    headers = { "content-type": "application/json" };
    body = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.25,
        responseMimeType: "application/json",
        responseSchema,
      },
    };
    extractText = (payload: any) => payload.candidates?.[0]?.content?.parts?.[0]?.text;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`API request failed (${response.status}): ${detail}`);
  }

  const payload = await response.json();
  const text = extractText(payload);
  if (!text) throw new Error("API returned an empty response");
  
  return JSON.parse(text);
}

function getErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (
    msg.includes("API_KEY_INVALID") ||
    msg.includes("API key not valid") ||
    msg.includes("PERMISSION_DENIED") ||
    msg.includes("400") ||
    msg.includes("401") ||
    msg.includes("403")
  ) {
    return "The provided API key is invalid or unauthorized. Please verify your API key and update it in the API Key Settings.";
  }
  if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
    return "Quota or rate limit exceeded for this API key. Please check your usage limits or try again in a few moments.";
  }
  return "An error occurred while communicating with the AI provider. Please check your API key in API Key Settings and try again.";
}

function formatSources(
  sources: Array<{
    id: string;
    name: string;
    pages: Array<{ pageNumber: number; text: string }>;
  }>,
): string {
  let remaining = MAX_SOURCE_CHARS;
  const blocks: string[] = [];

  for (const source of sources) {
    for (const page of source.pages) {
      if (remaining <= 0) break;
      const header = `\n[SOURCE ${source.id} | ${source.name} | PAGE ${page.pageNumber}]\n`;
      const text = page.text.slice(0, Math.max(0, remaining - header.length));
      blocks.push(`${header}${text}`);
      remaining -= header.length + text.length;
    }
    if (remaining <= 0) break;
  }
  return blocks.join("\n");
}

router.post("/study/explain", async (req, res) => {
  const parsed = ExplainStudyTopicBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Add a question or lecture PDF." });
    return;
  }

  const { prompt, sources, model } = parsed.data;
  if (!prompt.trim() && sources.length === 0) {
    res.status(400).json({ error: "Add a question or lecture PDF." });
    return;
  }
  const isOpenAI = model?.startsWith("gpt-");
  const isAnthropic = model?.startsWith("claude-");
  let apiKey = req.get("x-gemini-api-key")?.trim();
  if (isOpenAI) apiKey = req.get("x-openai-api-key")?.trim();
  if (isAnthropic) apiKey = req.get("x-anthropic-api-key")?.trim();

  if (!apiKey) {
    res.json({
      title: "API Key Required",
      answerMarkdown: `Your ${isOpenAI ? 'OpenAI' : isAnthropic ? 'Anthropic' : 'Google Gemini'} API key is not configured. Please add it in API Key Settings to start using the Study Notebook.`,
      terms: [],
      sourceRefs: [],
      generatedAt: new Date().toISOString()
    });
    return;
  }

  try {
    const sourceText = formatSources(sources);
    const raw = await generateStructured(
      `You are a patient and knowledgeable tutor. Give the student a high-quality, educational answer to their question. Start with a direct explanation, use examples where helpful, and build from familiar ideas toward complex details. Use Markdown headings, paragraphs, lists, and formatting when useful. Use LaTeX delimiters ($...$ for inline math and $$...$$ for display math).

QUESTION:
${prompt.trim() || "Explain the main ideas in these lecture materials."}

Identify 2-12 specialized terms, concepts, or jargon used verbatim in your answer that a beginner to the topic might not know. Do not include ordinary everyday words. Each term must appear exactly in answerMarkdown with the same spelling and capitalization. For every term, provide the sentence or short phrase where it appears as contextSnippet and a one-sentence plainDefinition. Do not add special markup around these terms; the client will underline them. If the user is just making small talk or greeting you without asking an educational question, just respond normally and return an empty terms array.

If lecture sources are supplied, prioritize them and cite only real source IDs/pages from the material. Include short verbatim excerpts. If no sources are supplied, answer from general knowledge and return an empty sourceRefs array.

LECTURE SOURCES:
${sourceText || "No lecture sources were uploaded."}`,
      studyExplanationSchema,
      model,
      req
    );

    res.json(
      ExplainStudyTopicResponse.parse({
        ...(raw as object),
        generatedAt: new Date().toISOString(),
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Study explanation failed");
    res.json({
      title: "Unable to Complete Request",
      answerMarkdown: getErrorMessage(error),
      terms: [],
      sourceRefs: [],
      generatedAt: new Date().toISOString(),
    });
  }
});

router.post("/study/concepts/explain", async (req, res) => {
  const parsed = ExplainTechnicalConceptBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.term.trim()) {
    res.status(400).json({ error: "Choose a technical concept to explain." });
    return;
  }

  const { term, context, sources, model } = parsed.data;
  const isOpenAI = model?.startsWith("gpt-");
  const isAnthropic = model?.startsWith("claude-");
  let apiKey = req.get("x-gemini-api-key")?.trim();
  if (isOpenAI) apiKey = req.get("x-openai-api-key")?.trim();
  if (isAnthropic) apiKey = req.get("x-anthropic-api-key")?.trim();

  if (!apiKey) {
    res.json({
      title: "API Key Required",
      answerMarkdown: `Your ${isOpenAI ? 'OpenAI' : isAnthropic ? 'Anthropic' : 'Google Gemini'} API key is not configured. Please add it in API Key Settings to explain concepts.`,
      prerequisiteTerms: [],
      sourceRefs: []
    });
    return;
  }

  try {
    const raw = await generateStructured(
      `You are a patient and knowledgeable tutor. Explain the concept "${term}" as a standalone learning page for a beginner who clicked the term inside another explanation.

ORIGINAL CONTEXT:
${context || "No additional context was provided."}

Give a direct definition first, then explain why it matters, how it works, and one concrete example. Use clear Markdown and LaTeX delimiters ($...$ for inline math and $$...$$ for display math). Avoid assuming the student knows related jargon. Return 0-6 prerequisiteTerms that would genuinely help the student understand this concept; use concise exact terms suitable for opening another explanation page.

If the lecture sources discuss the concept, prioritize them and cite only real source IDs/pages with short verbatim excerpts. Otherwise explain from general knowledge and return an empty sourceRefs array.

LECTURE SOURCES:
${formatSources(sources) || "No lecture sources were uploaded."}`,
      technicalConceptSchema,
      model,
      req
    );

    res.json(ExplainTechnicalConceptResponse.parse(raw));
  } catch (error) {
    req.log.error({ err: error }, "Technical concept explanation failed");
    res.json({
      title: "Unable to Complete Request",
      answerMarkdown: getErrorMessage(error),
      prerequisiteTerms: [],
      sourceRefs: [],
    });
  }
});

router.post("/study/follow-ups/explain", async (req, res) => {
  const parsed = ExplainSelectedPassageBody.safeParse(req.body);
  if (
    !parsed.success ||
    !parsed.data.selectedText.trim() ||
    !parsed.data.question.trim()
  ) {
    res.status(400).json({ error: "Select a passage and ask a question about it." });
    return;
  }

  const { selectedText, question, answerContext, sources, model } = parsed.data;
  const isOpenAI = model?.startsWith("gpt-");
  const isAnthropic = model?.startsWith("claude-");
  let apiKey = req.get("x-gemini-api-key")?.trim();
  if (isOpenAI) apiKey = req.get("x-openai-api-key")?.trim();
  if (isAnthropic) apiKey = req.get("x-anthropic-api-key")?.trim();

  if (!apiKey) {
    res.json({
      title: "API Key Required",
      answerMarkdown: `Your ${isOpenAI ? 'OpenAI' : isAnthropic ? 'Anthropic' : 'Google Gemini'} API key is not configured. Please add it in API Key Settings to ask follow-up questions.`,
      terms: [],
      sourceRefs: []
    });
    return;
  }

  try {
    const raw = await generateStructured(
      `You are a patient and knowledgeable tutor answering a student's focused follow-up question about a passage they selected from an earlier AI explanation.

SELECTED PASSAGE:
"""
${selectedText}
"""

STUDENT'S FOLLOW-UP:
${question}

EARLIER ANSWER CONTEXT:
${answerContext || "No additional answer context was provided."}

Answer the follow-up directly. Clearly connect the answer to the selected passage, explain assumptions and unfamiliar notation, and use a concrete example when useful. Use clear Markdown and LaTeX delimiters ($...$ for inline math and $$...$$ for display math). Do not merely repeat the selected passage.

Identify 0-8 specialized terms, concepts, or jargon used verbatim in your answer that a beginner to the topic might not know. Do not include ordinary everyday words. Each term must appear exactly in answerMarkdown with the same spelling and capitalization. For every term, provide the sentence or short phrase where it appears as contextSnippet and a one-sentence plainDefinition. Do not add special markup around these terms; the client will underline them. If no complex terms are used, return an empty array.

If the lecture sources support the answer, prioritize them and cite only real source IDs/pages with short verbatim excerpts. Otherwise answer from general knowledge and return an empty sourceRefs array.

LECTURE SOURCES:
${formatSources(sources) || "No lecture sources were uploaded."}`,
      selectedPassageSchema,
      model,
      req
    );

    res.json(ExplainSelectedPassageResponse.parse(raw));
  } catch (error) {
    req.log.error({ err: error }, "Selected passage explanation failed");
    res.json({
      title: "Unable to Complete Request",
      answerMarkdown: getErrorMessage(error),
      terms: [],
      sourceRefs: [],
    });
  }
});

export default router;