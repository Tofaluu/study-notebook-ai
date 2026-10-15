import { describe, expect, it } from "vitest";
import {
  formatSources,
  getErrorMessage,
  imagesFromSources,
  normalizeExplanation,
  stripAdditionalProperties,
} from "./normalize";

describe("formatSources", () => {
  const sources = [
    {
      id: "s1",
      name: "Lecture 1.pdf",
      pages: [
        { pageNumber: 1, text: "Intro" },
        { pageNumber: 2, text: "Details" },
      ],
    },
  ];

  it("tags every page with its source id, name and page number", () => {
    const formatted = formatSources(sources);
    expect(formatted).toContain("[SOURCE s1 | Lecture 1.pdf | PAGE 1]\nIntro");
    expect(formatted).toContain("[SOURCE s1 | Lecture 1.pdf | PAGE 2]\nDetails");
  });

  it("stops once the character budget is spent", () => {
    const formatted = formatSources(sources, 45);
    expect(formatted).toContain("PAGE 1");
    expect(formatted).not.toContain("PAGE 2");
    expect(formatted.length).toBeLessThanOrEqual(45);
  });

  it("returns an empty string when there are no sources", () => {
    expect(formatSources([])).toBe("");
  });
});

describe("normalizeExplanation", () => {
  it("fills missing arrays and string fields", () => {
    expect(normalizeExplanation({ terms: "oops" })).toEqual({
      title: "Study Explanation",
      answerMarkdown: "No explanation provided.",
      terms: [],
      sourceRefs: [],
      prerequisiteTerms: [],
    });
  });

  it("recovers content when the model echoes the schema instead of an instance", () => {
    const echoed = {
      type: "object",
      properties: { title: "Recursion", answerMarkdown: "A function calling itself.", terms: [] },
    };
    expect(normalizeExplanation(echoed)).toMatchObject({
      title: "Recursion",
      answerMarkdown: "A function calling itself.",
      terms: [],
    });
  });

  it("passes non-objects through untouched", () => {
    expect(normalizeExplanation(null)).toBeNull();
    expect(normalizeExplanation("text")).toBe("text");
  });
});

describe("stripAdditionalProperties", () => {
  it("removes the keyword at every depth", () => {
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: { list: { type: "array", items: { type: "object", additionalProperties: false } } },
    };
    expect(stripAdditionalProperties(schema)).toEqual({
      type: "object",
      properties: { list: { type: "array", items: { type: "object" } } },
    });
  });
});

describe("imagesFromSources", () => {
  it("keeps only image sources that carry data, defaulting the mime type", () => {
    const images = imagesFromSources([
      { id: "a", name: "notes.pdf", type: "pdf", text: "", pageCount: 1, pages: [] },
      { id: "b", name: "photo", type: "image", base64Data: "QUJD", text: "", pageCount: 1, pages: [] },
      { id: "c", name: "empty", type: "image", text: "", pageCount: 1, pages: [] },
    ]);
    expect(images).toEqual([{ name: "photo", mimeType: "image/jpeg", data: "QUJD" }]);
  });
});

describe("getErrorMessage", () => {
  it.each([
    [new Error("API request failed (401): nope"), "invalid or unauthorized"],
    [new Error("API request failed (429): slow down"), "rate limit exceeded"],
    [new Error("API request failed (400): bad schema"), "Bad Request (400)"],
    ["socket hang up", "communicating with the AI provider: socket hang up"],
  ])("maps %s to a readable message", (error, expected) => {
    expect(getErrorMessage(error)).toContain(expected);
  });
});
