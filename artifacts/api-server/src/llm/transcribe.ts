import { stripDataUrlPrefix } from "./normalize";

export type TranscribeProviderId = "gemini" | "openai";

export interface TranscribeRequest {
  provider: TranscribeProviderId;
  apiKey: string;
  /** Base64 audio, optionally with a `data:<mime>;base64,` header. */
  audio: string;
  mimeType: string;
}

// The fast tier, as for the voice-command classifier: transcribing a sentence needs speed, not depth
const GEMINI_MODEL = "gemini-3.1-flash-lite";
// OpenAI recommends this for recorded speech; whisper-1 and the gpt-4o-*-transcribe models shut down on 2027-02-26
const OPENAI_MODEL = "gpt-transcribe";
const REQUEST_TIMEOUT_MS = 60_000;

const GEMINI_PROMPT =
  "Transcribe the speech in this audio exactly as spoken, in the language spoken. Return only the transcript, with no " +
  "commentary or quotation marks. If there is no speech, return an empty string.";

const EXTENSIONS: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/flac": "flac",
};

export function isSupportedAudioType(mimeType: string): boolean {
  return mimeType.split(";")[0].trim().toLowerCase() in EXTENSIONS;
}

async function ensureOk(response: Response): Promise<void> {
  if (response.ok) return;
  throw new Error(`API request failed (${response.status}): ${await response.text()}`);
}

/** Turns one short recording into text with the user's own key. Returns "" when nothing was said. */
export async function transcribeAudio(
  { provider, apiKey, audio, mimeType }: TranscribeRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const data = stripDataUrlPrefix(audio);
  const baseMime = mimeType.split(";")[0].trim().toLowerCase();

  if (provider === "openai") {
    const form = new FormData();
    form.append("file", new Blob([Buffer.from(data, "base64")], { type: baseMime }), `speech.${EXTENSIONS[baseMime] ?? "wav"}`);
    form.append("model", OPENAI_MODEL);
    const response = await fetchImpl("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    await ensureOk(response);
    const payload = (await response.json()) as { text?: string };
    return (payload.text ?? "").trim();
  }

  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: GEMINI_PROMPT }, { inlineData: { mimeType: baseMime, data } }] }],
        generationConfig: { temperature: 0 },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  await ensureOk(response);
  const payload = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return (payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
}
