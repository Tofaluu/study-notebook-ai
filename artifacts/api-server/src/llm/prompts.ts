import type { LectureSource } from "@workspace/api-zod";
import { formatSources } from "./normalize";

// Prompt text is kept verbatim from the original routes; only the inputs are parameterized.

export function buildStudyPrompt(prompt: string, sources: LectureSource[]): string {
  return `You are a patient and knowledgeable tutor. Give the student a high-quality, educational answer to their question. Start with a direct explanation, use examples where helpful, and build from familiar ideas toward complex details. Use Markdown headings, paragraphs, lists, and formatting when useful. Use LaTeX delimiters ($...$ for inline math and $$...$$ for display math). IMPORTANT: Never place ordinary English text or markdown formatting (like bold/italics) inside LaTeX math blocks; only mathematical formulas go inside math delimiters.

  QUESTION:
  ${prompt.trim() || "Explain the main ideas in these lecture materials."}
  
  You must generate a short, descriptive title for your explanation in the title field. Identify 2-12 specialized terms, concepts, or jargon used verbatim in your answer that a beginner to the topic might not know. Do not include ordinary everyday words. Each term must appear exactly in answerMarkdown with the same spelling and capitalization. For every term, provide the sentence or short phrase where it appears as contextSnippet and a one-sentence plainDefinition. Do not add special markup around these terms; the client will underline them. If the user is just making small talk or greeting you without asking an educational question (and no images or lecture materials are involved), just respond normally and return an empty terms array.

If lecture sources are supplied, prioritize them and cite only real source IDs/pages from the material. Include short verbatim excerpts. If no sources are supplied, answer from general knowledge and return an empty sourceRefs array.

LECTURE SOURCES:
${formatSources(sources) || "No lecture sources were uploaded."}`;
}

export function buildConceptPrompt(term: string, context: string | undefined, sources: LectureSource[]): string {
  return `You are a patient and knowledgeable tutor. Explain the concept "${term}" as a standalone learning page for a beginner who clicked the term inside another explanation.

  ORIGINAL CONTEXT:
  ${context || "No additional context was provided."}
  
  You must generate a short, descriptive title for your explanation in the title field. Give a direct definition first, then explain why it matters, how it works, and one concrete example. Use clear Markdown and LaTeX delimiters ($...$ for inline math and $$...$$ for display math). IMPORTANT: Never place ordinary English text or markdown formatting (like bold/italics) inside LaTeX math blocks; only mathematical formulas go inside math delimiters. Avoid assuming the student knows related jargon. Return 0-6 prerequisiteTerms that would genuinely help the student understand this concept; use concise exact terms suitable for opening another explanation page.

If the lecture sources discuss the concept, prioritize them and cite only real source IDs/pages with short verbatim excerpts. Otherwise explain from general knowledge and return an empty sourceRefs array.

LECTURE SOURCES:
${formatSources(sources) || "No lecture sources were uploaded."}`;
}

export function buildFollowUpPrompt(
  selectedText: string,
  question: string,
  answerContext: string | undefined,
  sources: LectureSource[],
): string {
  return `You are a patient and knowledgeable tutor answering a student's focused follow-up question about a passage they selected from an earlier AI explanation.

SELECTED PASSAGE:
"""
${selectedText}
"""

STUDENT'S FOLLOW-UP:
${question}

  EARLIER ANSWER CONTEXT:
  ${answerContext || "No additional answer context was provided."}
  
  You must generate a short, descriptive title for your explanation in the title field. Answer the follow-up directly. Clearly connect the answer to the selected passage, explain assumptions and unfamiliar notation, and use a concrete example when useful. Use clear Markdown and LaTeX delimiters ($...$ for inline math and $$...$$ for display math). IMPORTANT: Never place ordinary English text or markdown formatting (like bold/italics) inside LaTeX math blocks; only mathematical formulas go inside math delimiters. Do not merely repeat the selected passage.

Identify 0-8 specialized terms, concepts, or jargon used verbatim in your answer that a beginner to the topic might not know. Do not include ordinary everyday words. Each term must appear exactly in answerMarkdown with the same spelling and capitalization. For every term, provide the sentence or short phrase where it appears as contextSnippet and a one-sentence plainDefinition. Do not add special markup around these terms; the client will underline them. If no complex terms are used, return an empty array.

If the lecture sources support the answer, prioritize them and cite only real source IDs/pages with short verbatim excerpts. Otherwise answer from general knowledge and return an empty sourceRefs array.

LECTURE SOURCES:
${formatSources(sources) || "No lecture sources were uploaded."}`;
}

export function buildVoiceActionPrompt(transcript: string): string {
  return `You are an intelligent voice command parser and prompt refiner for an AI study notebook application.
The user spoke a command, but browser speech-to-text is often messy and produces conversational filler words and phonetic typos (for instance: "wraplet" instead of "Replit", "see plus plus" instead of "C++", "pie torch" instead of "PyTorch").

Analyze the user's intent and output the appropriate action:
1. If the user wants to open/explore/explain a concept in a new tab (e.g. "open a new tab for wraplet", "explain floating point in a new tab", "new tab on binary fractions"):
   - action: "new_concept_tab"
   - term: The cleaned, correctly spelled/capitalized technical concept (e.g. "Replit", "Floating Point", "Binary Fraction"). Do NOT include filler words like "explain" or "about".
2. If the user wants to rename the current notebook/chat session (e.g. "rename notebook to Operating Systems", "rename this to CS 240"):
   - action: "rename_notebook"
   - title: The cleaned, formatted notebook title.
3. If the user is asking an educational or conversational study question:
   - action: "dictate"
   - text: Reorganize and polish the question into a crisp, high-signal, properly punctuated study prompt. Strip out throat-clearing and filler words ("um", "can you tell me", "like", "hey so") and correct any phonetic STEM/coding typos, while strictly preserving the core intent of the question.

SPOKEN TRANSCRIPT:
"""
${transcript.trim()}
"""`;
}
