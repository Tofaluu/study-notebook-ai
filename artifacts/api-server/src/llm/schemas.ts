import type { JsonSchema } from "./types";

// JSON Schemas sent to the providers' structured-output modes. They mirror the
// response types in lib/api-spec/openapi.yaml (minus server-added fields).

const pageReferenceSchema = {
  type: "object",
  properties: {
    sourceId: { type: "string" },
    sourceName: { type: "string" },
    pageNumber: { type: "integer" },
    excerpt: { type: "string" },
  },
  required: ["sourceId", "sourceName", "pageNumber", "excerpt"],
  additionalProperties: false,
};

const explainableTermsSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      term: { type: "string" },
      contextSnippet: { type: "string" },
      plainDefinition: { type: "string" },
    },
    required: ["term", "contextSnippet", "plainDefinition"],
    additionalProperties: false,
  },
};

export const studyExplanationSchema: JsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    answerMarkdown: { type: "string" },
    terms: explainableTermsSchema,
    sourceRefs: { type: "array", items: pageReferenceSchema },
  },
  required: ["title", "answerMarkdown", "terms", "sourceRefs"],
  additionalProperties: false,
};

export const technicalConceptSchema: JsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    answerMarkdown: { type: "string" },
    prerequisiteTerms: { type: "array", items: { type: "string" } },
    sourceRefs: { type: "array", items: pageReferenceSchema },
  },
  required: ["title", "answerMarkdown", "prerequisiteTerms", "sourceRefs"],
  additionalProperties: false,
};

// Same shape as a study explanation; kept separate so the two can diverge.
export const selectedPassageSchema: JsonSchema = {
  ...studyExplanationSchema,
};
