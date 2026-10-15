import { describe, expect, it, vi } from "vitest";
import { generateStructured, resolveProvider } from "./providers";

describe("resolveProvider", () => {
  it.each([
    ["gpt-6-luna", "openai"],
    ["claude-sonnet-5-5", "anthropic"],
    ["gemini-3.8-flash", "gemini"],
    [undefined, "gemini"],
  ])("routes %s to %s", (model, expected) => {
    expect(resolveProvider(model).id).toBe(expected);
  });
});

describe("generateStructured", () => {
  const base = { prompt: "p", schema: { type: "object" }, apiKey: "k", images: [] };

  it("posts to the resolved provider and parses its JSON payload", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ choices: [{ message: { content: '{"title":"Done"}' } }] }),
    );

    const result = await generateStructured({ ...base, model: "gpt-6-luna" }, fetchImpl);

    expect(result).toEqual({ title: "Done" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("includes the provider status and body when the request fails", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad key", { status: 401 }));
    await expect(generateStructured({ ...base, model: "gemini-3.8-flash" }, fetchImpl)).rejects.toThrow(
      "API request failed (401): bad key",
    );
  });

  it("rejects an empty structured response", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ candidates: [] }));
    await expect(generateStructured({ ...base, model: "gemini-3.8-flash" }, fetchImpl)).rejects.toThrow(
      "API returned an empty response",
    );
  });
});
