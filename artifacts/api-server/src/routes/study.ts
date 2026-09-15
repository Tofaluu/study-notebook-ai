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
): Promise<unknown> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.25,
          responseMimeType: "application/json",
          responseSchema,
        },
      }),
      signal: AbortSignal.timeout(90_000),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${detail}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned an empty response");
  return JSON.parse(text);
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

  try {
    const sourceText = formatSources(sources);
    const raw = await generateStructured(
      `You are a patient computer science tutor. Give the student a normal, high-quality chat answer to their question. Start with a direct explanation, use examples where helpful, and build from familiar ideas toward technical detail. Use Markdown headings, paragraphs, lists, and code fences when useful.

QUESTION:
${prompt.trim() || "Explain the main ideas in these lecture materials."}

Identify 4-12 technical words or phrases used verbatim in answerMarkdown that a beginner may not consider common knowledge. Examples include DOM, props, component, state, API, closure, recursion, or event loop. Do not include ordinary words. Each term must appear exactly in answerMarkdown with the same spelling and capitalization. For every term, provide the sentence or short phrase where it appears as contextSnippet and a one-sentence plainDefinition. Do not add special markup around these terms; the client will underline them.

If lecture sources are supplied, prioritize them and cite only real source IDs/pages from the material. Include short verbatim excerpts. If no sources are supplied, answer from general knowledge and return an empty sourceRefs array.

LECTURE SOURCES:
${sourceText || "No lecture sources were uploaded."}`,
      studyExplanationSchema,
      model,
    );

    res.json(
      ExplainStudyTopicResponse.parse({
        ...(raw as object),
        generatedAt: new Date().toISOString(),
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Study explanation failed");
    res.status(500).json({
      error:
        error instanceof Error && error.message.includes("GEMINI_API_KEY")
          ? "Gemini is not configured yet."
          : "Gemini could not create the explanation. Try a shorter question or fewer lecture files.",
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

  try {
    const raw = await generateStructured(
      `You are a patient computer science tutor. Explain the technical concept "${term}" as a standalone learning page for a beginner who clicked the term inside another explanation.

ORIGINAL CONTEXT:
${context || "No additional context was provided."}

Give a direct definition first, then explain why it matters, how it works, and one concrete example. Use clear Markdown. Avoid assuming the student knows related jargon. Return 0-6 prerequisiteTerms that would genuinely help the student understand this concept; use concise exact terms suitable for opening another explanation page.

If the lecture sources discuss the concept, prioritize them and cite only real source IDs/pages with short verbatim excerpts. Otherwise explain from general knowledge and return an empty sourceRefs array.

LECTURE SOURCES:
${formatSources(sources) || "No lecture sources were uploaded."}`,
      technicalConceptSchema,
      model,
    );

    res.json(ExplainTechnicalConceptResponse.parse(raw));
  } catch (error) {
    req.log.error({ err: error }, "Technical concept explanation failed");
    res.status(500).json({
      error: "Gemini could not explain that concept. Try opening it again.",
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

  try {
    const raw = await generateStructured(
      `You are a patient tutor answering a student's focused follow-up question about a passage they selected from an earlier AI explanation.

SELECTED PASSAGE:
"""
${selectedText}
"""

STUDENT'S FOLLOW-UP:
${question}

EARLIER ANSWER CONTEXT:
${answerContext || "No additional answer context was provided."}

Answer the follow-up directly. Clearly connect the answer to the selected passage, explain assumptions and unfamiliar notation, and use a concrete example when useful. Use clear Markdown and LaTeX delimiters ($...$ for inline math and $$...$$ for display math). Do not merely repeat the selected passage.

Identify 2-8 technical words or phrases used verbatim in answerMarkdown that a beginner may not consider common knowledge. Examples include gradient descent, overfitting, API, recursion, or event loop. Do not include ordinary words. Each term must appear exactly in answerMarkdown with the same spelling and capitalization. For every term, provide the sentence or short phrase where it appears as contextSnippet and a one-sentence plainDefinition. Do not add special markup around these terms; the client will underline them.

If the lecture sources support the answer, prioritize them and cite only real source IDs/pages with short verbatim excerpts. Otherwise answer from general knowledge and return an empty sourceRefs array.

LECTURE SOURCES:
${formatSources(sources) || "No lecture sources were uploaded."}`,
      selectedPassageSchema,
      model,
    );

    res.json(ExplainSelectedPassageResponse.parse(raw));
  } catch (error) {
    req.log.error({ err: error }, "Selected passage explanation failed");
    res.status(500).json({
      error: "Gemini could not answer that follow-up. Try a shorter selection or question.",
    });
  }
});

export default router;