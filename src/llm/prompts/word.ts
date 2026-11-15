import type { CEFRLevel } from "@/schemas/lesson";

export function wordLookupPrompts(
  word: string,
  contextSentence: string,
  cefrLevel: CEFRLevel,
): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt: [
      "You are an English vocabulary teacher for a French-speaking learner.",
      "Return only one valid JSON object with term, translation, phonetic, example, and example_fr.",
      "Give the contextual French meaning of the requested English word, accurate IPA, and a concise natural example suitable for the learner's CEFR level.",
    ].join(" "),
    userPrompt: JSON.stringify({ word, contextSentence, cefrLevel }),
  };
}
