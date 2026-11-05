import { Router, type IRouter, type Request } from "express";
import {
  ExplainStudyTopicBody,
  ExplainStudyTopicResponse,
  ExplainTechnicalConceptBody,
  ExplainTechnicalConceptResponse,
  ExplainSelectedPassageBody,
  ExplainSelectedPassageResponse,
} from "@workspace/api-zod";
import { DEFAULT_MODEL, generateStructured, resolveProvider } from "../llm/providers";
import { getErrorMessage, imagesFromSources, normalizeExplanation } from "../llm/normalize";
import { buildConceptPrompt, buildFollowUpPrompt, buildStudyPrompt, buildVoiceActionPrompt } from "../llm/prompts";
import { selectedPassageSchema, studyExplanationSchema, technicalConceptSchema, voiceActionSchema } from "../llm/schemas";
import type { ProviderAdapter } from "../llm/types";

const router: IRouter = Router();

/** Bring-your-own-key: the browser forwards the user's key for the chosen provider. */
function getApiKey(req: Request, provider: ProviderAdapter): string | undefined {
  return req.get(provider.apiKeyHeader)?.trim() || undefined;
}

function missingKeyMessage(provider: ProviderAdapter, action: string): string {
  return `Your ${provider.displayName} API key is not configured. Please add it in API Key Settings to ${action}.`;
}

router.post("/study/explain", async (req, res) => {
  const parsed = ExplainStudyTopicBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.error({ err: parsed.error }, "Invalid study explanation request");
    res.status(400).json({ error: "Add a question or lecture PDF." });
    return;
  }

  const { prompt, sources, model } = parsed.data;
  if (!prompt.trim() && sources.length === 0) {
    res.status(400).json({ error: "Add a question or lecture PDF." });
    return;
  }

  const provider = resolveProvider(model);
  const apiKey = getApiKey(req, provider);
  if (!apiKey) {
    res.json({
      title: "API Key Required",
      answerMarkdown: missingKeyMessage(provider, "start using the Study Notebook"),
      terms: [],
      sourceRefs: [],
      generatedAt: new Date().toISOString(),
    });
    return;
  }

  try {
    const raw = await generateStructured({
      prompt: buildStudyPrompt(prompt, sources),
      schema: studyExplanationSchema,
      model: model ?? DEFAULT_MODEL,
      apiKey,
      images: imagesFromSources(sources),
    });

    res.json(
      ExplainStudyTopicResponse.parse({
        ...(normalizeExplanation(raw) as object),
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
  const provider = resolveProvider(model);
  const apiKey = getApiKey(req, provider);
  if (!apiKey) {
    res.json({
      title: "API Key Required",
      answerMarkdown: missingKeyMessage(provider, "explain concepts"),
      prerequisiteTerms: [],
      sourceRefs: [],
    });
    return;
  }

  try {
    const raw = await generateStructured({
      prompt: buildConceptPrompt(term, context, sources),
      schema: technicalConceptSchema,
      model: model ?? DEFAULT_MODEL,
      apiKey,
      images: imagesFromSources(sources),
    });

    res.json(ExplainTechnicalConceptResponse.parse(normalizeExplanation(raw)));
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
  if (!parsed.success || !parsed.data.selectedText.trim() || !parsed.data.question.trim()) {
    res.status(400).json({ error: "Select a passage and ask a question about it." });
    return;
  }

  const { selectedText, question, answerContext, sources, model } = parsed.data;
  const provider = resolveProvider(model);
  const apiKey = getApiKey(req, provider);
  if (!apiKey) {
    res.json({
      title: "API Key Required",
      answerMarkdown: missingKeyMessage(provider, "ask follow-up questions"),
      terms: [],
      sourceRefs: [],
    });
    return;
  }

  try {
    const raw = await generateStructured({
      prompt: buildFollowUpPrompt(selectedText, question, answerContext, sources),
      schema: selectedPassageSchema,
      model: model ?? DEFAULT_MODEL,
      apiKey,
      images: imagesFromSources(sources),
    });

    res.json(ExplainSelectedPassageResponse.parse(normalizeExplanation(raw)));
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

router.post("/study/voice/action", async (req, res) => {
  const transcript = typeof req.body?.transcript === "string" ? req.body.transcript.trim() : "";
  if (!transcript) {
    res.json({ action: "dictate", text: "" });
    return;
  }

  const requestedModel = typeof req.body?.model === "string" ? req.body.model : undefined;
  // Choose the fastest, lowest-cost micro-tier model for voice command classification
  let fastModel = "gemini-3.1-flash-lite";
  if (requestedModel?.startsWith("gpt-")) {
    fastModel = "gpt-6-luna"; // fastest OpenAI tier
  } else if (requestedModel?.startsWith("claude-")) {
    fastModel = "claude-haiku-4-5"; // fastest Anthropic tier
  }

  const provider = resolveProvider(fastModel);
  const apiKey = getApiKey(req, provider);

  if (!apiKey) {
    // If no key is configured, fallback smoothly
    res.json({ action: "dictate", text: transcript });
    return;
  }

  try {
    const raw = await generateStructured({
      prompt: buildVoiceActionPrompt(transcript),
      schema: voiceActionSchema,
      model: fastModel,
      apiKey,
      images: [],
    });

    res.json(raw);
  } catch (error) {
    req.log.warn({ err: error }, "Voice action classification failed; falling back to dictation");
    res.json({ action: "dictate", text: transcript });
  }
});

export default router;
