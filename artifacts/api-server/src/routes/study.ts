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
import type { ProviderAdapter, TokenUsage } from "../llm/types";
import { gemini } from "../llm/gemini";
import { openai } from "../llm/openai";
import { isSupportedAudioType, transcribeAudio, type TranscribeProviderId } from "../llm/transcribe";
import {
  FREE_QUERY_LIMIT,
  resolveExecutionAccess,
  type ExecutionAccessResult,
} from "../lib/billing";
import { recordAnalyticsEvent } from "../lib/analytics";

const router: IRouter = Router();

function logStudyAccess(
  access: ExecutionAccessResult,
  endpoint: "explain" | "concept" | "followup" | "transcribe",
  model: string,
  provider: string,
): void {
  void recordAnalyticsEvent({
    eventName: "ai_query",
    userId: access.userId ?? null,
    properties: {
      endpoint,
      model,
      provider,
      authMode: access.allowed ? access.mode : "denied",
      ...(access.allowed ? {} : { reason: access.reason }),
    },
  });
}

/** Bring-your-own-key: the browser forwards the user's key for the chosen provider. */
function getApiKey(req: Request, provider: ProviderAdapter): string | undefined {
  return req.get(provider.apiKeyHeader)?.trim() || undefined;
}

function missingKeyMessage(provider: ProviderAdapter, action: string): string {
  return `Your ${provider.displayName} API key is not configured. Sign in via Plan & Usage for 15 free questions on Gemini Flash, or add your own key in API Key Settings to ${action}.`;
}

function buildAccessDeniedExplanation(
  access: Extract<ExecutionAccessResult, { allowed: false }>,
  provider: ProviderAdapter,
  action: string,
): { title: string; answerMarkdown: string } {
  if (access.reason === "pro_model_required") {
    return {
      title: "Pro Plan or API Key Required",
      answerMarkdown: `This model requires the **Pro Plan** or your own ${provider.displayName} API key. Upgrade in Plan & Usage, add your key in API Key Settings, or switch to **Gemini 3.8 Flash** to use your free questions.`,
    };
  }

  if (access.reason === "quota_exceeded") {
    if (access.subscription?.plan === "pro") {
      return {
        title: "Monthly Pro Limit Reached",
        answerMarkdown: `You've used 100% of your included monthly Pro usage for this billing period. View your subscription in Plan & Usage, or add your own ${provider.displayName} API key in API Key Settings for unlimited usage.`,
      };
    }
    const limit = access.subscription?.queriesLimit ?? FREE_QUERY_LIMIT;
    return {
      title: "Free Limit Reached",
      answerMarkdown: `You've used all ${limit} free questions included with your account. Upgrade to Pro in Plan & Usage to unlock all Gemini, OpenAI, and Claude models, or add your own ${provider.displayName} API key in API Key Settings for unlimited usage.`,
    };
  }

  return {
    title: "API Key Required",
    answerMarkdown: missingKeyMessage(provider, action),
  };
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

  const effectiveModel = model ?? DEFAULT_MODEL;
  const provider = resolveProvider(effectiveModel);
  const access = await resolveExecutionAccess({
    req,
    model: effectiveModel,
    provider: provider.id,
    userProvidedKey: getApiKey(req, provider),
  });
  logStudyAccess(access, "explain", effectiveModel, provider.id);

  if (!access.allowed) {
    const denied = buildAccessDeniedExplanation(access, provider, "start using the Study Notebook");
    res.json({
      title: denied.title,
      answerMarkdown: denied.answerMarkdown,
      terms: [],
      sourceRefs: [],
      generatedAt: new Date().toISOString(),
    });
    return;
  }

  try {
    let usage: TokenUsage | undefined;
    const raw = await generateStructured({
      prompt: buildStudyPrompt(prompt, sources),
      schema: studyExplanationSchema,
      model: effectiveModel,
      apiKey: access.apiKey,
      images: imagesFromSources(sources),
      onUsage: (u) => {
        usage = u;
      },
    });

    await access.consumeQuota(usage);

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
  const effectiveModel = model ?? DEFAULT_MODEL;
  const provider = resolveProvider(effectiveModel);
  const access = await resolveExecutionAccess({
    req,
    model: effectiveModel,
    provider: provider.id,
    userProvidedKey: getApiKey(req, provider),
  });
  logStudyAccess(access, "concept", effectiveModel, provider.id);

  if (!access.allowed) {
    const denied = buildAccessDeniedExplanation(access, provider, "explain concepts");
    res.json({
      title: denied.title,
      answerMarkdown: denied.answerMarkdown,
      prerequisiteTerms: [],
      sourceRefs: [],
    });
    return;
  }

  try {
    let usage: TokenUsage | undefined;
    const raw = await generateStructured({
      prompt: buildConceptPrompt(term, context, sources),
      schema: technicalConceptSchema,
      model: effectiveModel,
      apiKey: access.apiKey,
      images: imagesFromSources(sources),
      onUsage: (u) => {
        usage = u;
      },
    });

    await access.consumeQuota(usage);

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
  const effectiveModel = model ?? DEFAULT_MODEL;
  const provider = resolveProvider(effectiveModel);
  const access = await resolveExecutionAccess({
    req,
    model: effectiveModel,
    provider: provider.id,
    userProvidedKey: getApiKey(req, provider),
  });
  logStudyAccess(access, "followup", effectiveModel, provider.id);

  if (!access.allowed) {
    const denied = buildAccessDeniedExplanation(access, provider, "ask follow-up questions");
    res.json({
      title: denied.title,
      answerMarkdown: denied.answerMarkdown,
      terms: [],
      sourceRefs: [],
    });
    return;
  }

  try {
    let usage: TokenUsage | undefined;
    const raw = await generateStructured({
      prompt: buildFollowUpPrompt(selectedText, question, answerContext, sources),
      schema: selectedPassageSchema,
      model: effectiveModel,
      apiKey: access.apiKey,
      images: imagesFromSources(sources),
      onUsage: (u) => {
        usage = u;
      },
    });

    await access.consumeQuota(usage);

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
  const access = await resolveExecutionAccess({
    req,
    model: fastModel,
    provider: provider.id,
    userProvidedKey: getApiKey(req, provider),
  });

  if (!access.allowed) {
    // If no key or quota is available, fall back smoothly to plain dictation
    res.json({ action: "dictate", text: transcript });
    return;
  }

  try {
    let usage: TokenUsage | undefined;
    const raw = await generateStructured({
      prompt: buildVoiceActionPrompt(transcript),
      schema: voiceActionSchema,
      model: fastModel,
      apiKey: access.apiKey,
      images: [],
      onUsage: (u) => {
        usage = u;
      },
    });

    await access.consumeQuota(usage);
    res.json(raw);
  } catch (error) {
    req.log.warn({ err: error }, "Voice action classification failed; falling back to dictation");
    res.json({ action: "dictate", text: transcript });
  }
});

// A minute of 16 kHz speech is about 2 MB as base64; this leaves room without letting a body run to the JSON limit
const MAX_AUDIO_CHARS = 6_000_000;

const TRANSCRIBERS: Record<TranscribeProviderId, ProviderAdapter> = { gemini, openai };

/**
 * Turns a short recording into text, for browsers whose own speech recognition is unavailable (Chrome on iOS).
 * Uses the key of the selected model's provider when it can transcribe, otherwise whichever of Gemini or OpenAI
 * the user has saved.
 */
router.post("/study/voice/transcribe", async (req, res) => {
  const audio = typeof req.body?.audio === "string" ? req.body.audio : "";
  const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType : "audio/wav";
  const requestedModel = typeof req.body?.model === "string" ? req.body.model : "";

  if (!audio) {
    res.status(400).json({ error: "No audio was sent." });
    return;
  }
  if (audio.length > MAX_AUDIO_CHARS) {
    res.json({ text: "", error: "That recording is too long. Try a shorter question." });
    return;
  }
  if (!isSupportedAudioType(mimeType)) {
    res.status(400).json({ error: "Unsupported audio format." });
    return;
  }

  const order: TranscribeProviderId[] = requestedModel.startsWith("gpt-") ? ["openai", "gemini"] : ["gemini", "openai"];
  let selectedProvider: TranscribeProviderId | undefined;
  let selectedAccess: Extract<ExecutionAccessResult, { allowed: true }> | undefined;

  for (const id of order) {
    const access = await resolveExecutionAccess({
      req,
      model: id === "openai" ? "gpt-6-luna" : "gemini-3.8-flash",
      provider: id,
      userProvidedKey: getApiKey(req, TRANSCRIBERS[id]),
    });
    if (access.allowed) {
      selectedProvider = id;
      selectedAccess = access;
      break;
    }
  }

  if (!selectedProvider || !selectedAccess) {
    void recordAnalyticsEvent({
      eventName: "ai_query",
      properties: {
        endpoint: "transcribe",
        model: requestedModel || "gemini-3.8-flash",
        provider: order[0],
        authMode: "denied",
        reason: "missing_key",
      },
    });
    res.json({
      text: "",
      error: "Voice input in this browser needs a Google Gemini or OpenAI API key. Please add one in API Key Settings.",
    });
    return;
  }

  logStudyAccess(
    selectedAccess,
    "transcribe",
    selectedProvider === "openai" ? "gpt-6-luna" : "gemini-3.8-flash",
    selectedProvider,
  );

  try {
    const text = await transcribeAudio({
      provider: selectedProvider,
      apiKey: selectedAccess.apiKey,
      audio,
      mimeType,
    });
    await selectedAccess.consumeQuota();
    res.json({ text });
  } catch (error) {
    req.log.warn({ err: error }, "Voice transcription failed");
    res.json({ text: "", error: getErrorMessage(error) });
  }
});

export default router;
