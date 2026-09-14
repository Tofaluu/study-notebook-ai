import { Router, type IRouter } from "express";
import {
  AnalyzeConceptGraphBody,
  AnalyzeConceptGraphResponse,
  AskConceptQuestionBody,
  AskConceptQuestionResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const MODEL = process.env["GEMINI_MODEL"] || "gemini-3.6-flash";
const MAX_SOURCE_CHARS = 180_000;

type JsonSchema = Record<string, unknown>;

const graphSchema: JsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    overview: { type: "string" },
    nodes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          summary: { type: "string" },
          kind: {
            type: "string",
            enum: ["foundation", "core", "application"],
          },
          sourceIds: { type: "array", items: { type: "string" } },
          pageRefs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                sourceId: { type: "string" },
                sourceName: { type: "string" },
                pageNumber: { type: "integer" },
                excerpt: { type: "string" },
              },
              required: [
                "sourceId",
                "sourceName",
                "pageNumber",
                "excerpt",
              ],
            },
          },
        },
        required: [
          "id",
          "label",
          "summary",
          "kind",
          "sourceIds",
          "pageRefs",
        ],
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          relationship: { type: "string" },
        },
        required: ["from", "to", "relationship"],
      },
    },
  },
  required: ["title", "overview", "nodes", "edges"],
};

const answerSchema: JsonSchema = {
  type: "object",
  properties: {
    answer: { type: "string" },
    keyIdea: { type: "string" },
    relatedNodeIds: { type: "array", items: { type: "string" } },
    sourceRefs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sourceId: { type: "string" },
          sourceName: { type: "string" },
          pageNumber: { type: "integer" },
          excerpt: { type: "string" },
        },
        required: ["sourceId", "sourceName", "pageNumber", "excerpt"],
      },
    },
  },
  required: ["answer", "keyIdea", "relatedNodeIds", "sourceRefs"],
};

async function generateStructured(
  prompt: string,
  responseSchema: JsonSchema,
): Promise<unknown> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
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
  if (!text) {
    throw new Error("Gemini returned an empty response");
  }
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
    const pageBlocks: string[] = [];
    for (const page of source.pages) {
      if (remaining <= 0) break;
      const header = `\n[SOURCE ${source.id} | ${source.name} | PAGE ${page.pageNumber}]\n`;
      const text = page.text.slice(0, Math.max(0, remaining - header.length));
      pageBlocks.push(`${header}${text}`);
      remaining -= header.length + text.length;
    }
    blocks.push(pageBlocks.join(""));
    if (remaining <= 0) break;
  }
  return blocks.join("\n");
}

router.post("/concept-graphs/analyze", async (req, res) => {
  const parsed = AnalyzeConceptGraphBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Add a topic or at least one lecture PDF." });
    return;
  }

  const { title, prompt, sources } = parsed.data;
  if (!prompt.trim() && sources.length === 0) {
    res.status(400).json({ error: "Add a topic or at least one lecture PDF." });
    return;
  }

  try {
    const sourceText = formatSources(sources);
    const raw = await generateStructured(
      `You are an expert computer science tutor building a prerequisite map.

Study title: ${title || "Untitled study map"}
Student goal: ${prompt || "Understand the uploaded lectures"}

Build a directed concept graph with 6-18 useful concepts. An edge from A to B means A is a prerequisite needed before B. Include foundations that may not be explicitly taught but are necessary to understand the advanced ideas. Keep labels concise and summaries clear enough for a student who feels behind.

Ground every concept that appears in the lectures with exact source IDs, source names, page numbers, and short verbatim excerpts. Never invent page numbers or source IDs. A concept inferred as background knowledge may have empty sourceIds and pageRefs. IDs must be lowercase kebab-case and unique. Edges must only reference returned node IDs. Avoid duplicate concepts and cycles where possible.

LECTURE SOURCES:
${sourceText || "No lecture sources were uploaded. Build the graph from the student's goal using your general knowledge; leave all source references empty."}`,
      graphSchema,
    );

    const graph = AnalyzeConceptGraphResponse.parse({
      ...(raw as object),
      generatedAt: new Date().toISOString(),
    });
    res.json(graph);
  } catch (error) {
    req.log.error({ err: error }, "Concept graph analysis failed");
    res.status(500).json({
      error:
        error instanceof Error && error.message.includes("GEMINI_API_KEY")
          ? "Gemini is not configured yet."
          : "Gemini could not build the graph. Try a shorter prompt or fewer lecture files.",
    });
  }
});

router.post("/concept-graphs/ask", async (req, res) => {
  const parsed = AskConceptQuestionBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.question.trim()) {
    res.status(400).json({ error: "Enter a concept question." });
    return;
  }

  const { question, graph, sources } = parsed.data;

  try {
    const raw = await generateStructured(
      `You are a patient computer science tutor. Answer the student's question using the concept graph and lecture sources below. Explain missing prerequisite knowledge directly and in a logical order. Prefer plain language, then add precise terminology. Cite only source IDs and page numbers that appear in the provided sources. relatedNodeIds must only contain IDs from the graph.

QUESTION:
${question}

CONCEPT GRAPH:
${JSON.stringify(graph)}

LECTURE SOURCES:
${formatSources(sources) || "No lecture sources were uploaded. Answer from general knowledge and leave sourceRefs empty."}`,
      answerSchema,
    );

    res.json(AskConceptQuestionResponse.parse(raw));
  } catch (error) {
    req.log.error({ err: error }, "Concept question failed");
    res.status(500).json({
      error: "Gemini could not answer that question. Try rephrasing it.",
    });
  }
});

export default router;