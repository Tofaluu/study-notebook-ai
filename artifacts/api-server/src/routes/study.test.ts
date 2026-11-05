import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import app from "../app";

let server: Server;
let baseUrl: string;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Lets requests to the local test server through and answers provider calls with `payload`. */
function mockProvider(payload: unknown, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.startsWith(baseUrl)) return realFetch(input, init);
    return status === 200 ? Response.json(payload) : new Response(JSON.stringify(payload), { status });
  });
}

type ExplanationBody = { title: string; answerMarkdown: string; terms?: unknown[]; generatedAt?: string };

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return realFetch(`${baseUrl}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("GET /api/healthz", () => {
  it("reports ok", async () => {
    const response = await realFetch(`${baseUrl}/api/healthz`);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});

describe("POST /api/study/explain", () => {
  it("rejects a request with neither a prompt nor sources", async () => {
    const response = await post("/study/explain", { prompt: "  ", sources: [] });
    expect(response.status).toBe(400);
  });

  it("asks for a key for the selected provider when none is sent", async () => {
    const response = await post("/study/explain", { prompt: "What is a stack?", sources: [], model: "claude-sonnet-5-5" });
    const body = (await response.json()) as ExplanationBody;
    expect(body.title).toBe("API Key Required");
    expect(body.answerMarkdown).toContain("Anthropic API key is not configured");
  });

  it("returns a validated explanation from the provider", async () => {
    const providerFetch = mockProvider({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: "Stacks",
              answerMarkdown: "A stack is LIFO.",
              terms: [{ term: "LIFO", contextSnippet: "A stack is LIFO.", plainDefinition: "Last in, first out." }],
              sourceRefs: [],
            }),
          },
        },
      ],
    });

    const response = await post(
      "/study/explain",
      { prompt: "What is a stack?", sources: [], model: "gpt-6-luna" },
      { "x-openai-api-key": "sk-test" },
    );
    const body = (await response.json()) as ExplanationBody;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ title: "Stacks", terms: [{ term: "LIFO" }] });
    expect(typeof body.generatedAt).toBe("string");
    expect(providerFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer sk-test" }) }),
    );
  });

  it("turns provider failures into a readable answer instead of a 500", async () => {
    mockProvider({ error: "invalid" }, 401);
    const response = await post(
      "/study/explain",
      { prompt: "What is a stack?", sources: [] },
      { "x-gemini-api-key": "bad" },
    );
    const body = (await response.json()) as ExplanationBody;
    expect(response.status).toBe(200);
    expect(body.title).toBe("Unable to Complete Request");
    expect(body.answerMarkdown).toContain("invalid or unauthorized");
  });
});

describe("POST /api/study/concepts/explain", () => {
  it("normalizes a partial model response", async () => {
    mockProvider({ candidates: [{ content: { parts: [{ text: JSON.stringify({ title: "LIFO", answerMarkdown: "Last in." }) }] } }] });
    const response = await post(
      "/study/concepts/explain",
      { term: "LIFO", context: "A stack is LIFO.", sources: [], model: "gemini-3.8-flash" },
      { "x-gemini-api-key": "key" },
    );
    expect(await response.json()).toEqual({ title: "LIFO", answerMarkdown: "Last in.", prerequisiteTerms: [], sourceRefs: [] });
  });
});

describe("POST /api/study/follow-ups/explain", () => {
  it("requires both a selection and a question", async () => {
    const response = await post("/study/follow-ups/explain", { selectedText: "x", question: " ", sources: [] });
    expect(response.status).toBe(400);
  });
});

describe("POST /api/study/voice/transcribe", () => {
  const audio = Buffer.from("RIFF....WAVE").toString("base64");

  it("rejects a request with no audio", async () => {
    const response = await post("/study/voice/transcribe", { mimeType: "audio/wav" });
    expect(response.status).toBe(400);
  });

  it("rejects audio formats it can't pass on", async () => {
    const response = await post("/study/voice/transcribe", { audio, mimeType: "text/plain" }, { "x-gemini-api-key": "key" });
    expect(response.status).toBe(400);
  });

  it("asks for a Gemini or OpenAI key when there is none", async () => {
    const response = await post("/study/voice/transcribe", { audio, mimeType: "audio/wav", model: "claude-sonnet-5-5" });
    const body = (await response.json()) as { text: string; error?: string };
    expect(body.text).toBe("");
    expect(body.error).toContain("API Key Settings");
  });

  it("transcribes with Gemini", async () => {
    const providerFetch = mockProvider({ candidates: [{ content: { parts: [{ text: " why is zero point one inexact " }] } }] });
    const response = await post(
      "/study/voice/transcribe",
      { audio, mimeType: "audio/wav", model: "gemini-3.8-flash" },
      { "x-gemini-api-key": "key" },
    );
    expect(await response.json()).toEqual({ text: "why is zero point one inexact" });
    const geminiCall = providerFetch.mock.calls.find(([url]) => String(url).includes("generativelanguage"));
    expect(String(geminiCall?.[0])).toContain("key=key");
    expect(JSON.parse(String(geminiCall?.[1]?.body)).contents[0].parts[1].inlineData).toEqual({ mimeType: "audio/wav", data: audio });
  });

  it("uses OpenAI when the chosen model is OpenAI's", async () => {
    const providerFetch = mockProvider({ text: "open a new tab for heaps" });
    const response = await post(
      "/study/voice/transcribe",
      { audio, mimeType: "audio/wav", model: "gpt-6-luna" },
      { "x-openai-api-key": "sk-test", "x-gemini-api-key": "g-key" },
    );
    expect(await response.json()).toEqual({ text: "open a new tab for heaps" });
    const call = providerFetch.mock.calls.find(([url]) => String(url).includes("api.openai.com"));
    expect(String(call?.[0])).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect((call?.[1]?.body as FormData).get("model")).toBe("gpt-transcribe");
  });

  it("falls back to the other provider when only that key is saved", async () => {
    mockProvider({ candidates: [{ content: { parts: [{ text: "hello" }] } }] });
    const response = await post(
      "/study/voice/transcribe",
      { audio, mimeType: "audio/wav", model: "gpt-6-luna" },
      { "x-gemini-api-key": "g-key" },
    );
    expect(await response.json()).toEqual({ text: "hello" });
  });

  it("turns provider failures into a readable error", async () => {
    mockProvider({ error: "invalid" }, 401);
    const response = await post("/study/voice/transcribe", { audio, mimeType: "audio/wav" }, { "x-gemini-api-key": "bad" });
    const body = (await response.json()) as { text: string; error?: string };
    expect(response.status).toBe(200);
    expect(body.text).toBe("");
    expect(body.error).toContain("invalid or unauthorized");
  });
});
