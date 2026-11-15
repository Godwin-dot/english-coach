import type { CEFRLevel } from "@/schemas/lesson";

export function lessonPrompts(
  topic: string,
  cefrLevel: CEFRLevel,
): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt: [
      "You are a thoughtful English teacher for a French-speaking learner.",
      "Return only one valid JSON object that matches the requested schema.",
      "Write natural English suitable for the requested CEFR level and translate it faithfully into French.",
      "The English passage must contain between 120 and 180 words.",
      "Choose five useful words that occur in the English passage. Give each word its contextual French translation, accurate IPA pronunciation, a natural English example, and its French translation.",
      "Write three comprehension questions in English, each with exactly four answer options, one correct answer index from 0 to 3, and an explanation in French.",
    ].join(" "),
    userPrompt: JSON.stringify({
      topic,
      cefrLevel,
      requiredShape: {
        content_en: "English passage, 120-180 words",
        content_fr: "Faithful French translation",
        keywords: [
          {
            term: "word from the passage",
            translation: "contextual French meaning",
            phonetic: "IPA",
            example: "Natural English sentence",
            example_fr: "French translation of the example",
          },
        ],
        quiz: [
          {
            question: "English comprehension question",
            options: ["Option A", "Option B", "Option C", "Option D"],
            answer_index: 0,
            explanation: "French explanation",
          },
        ],
      },
    }),
  };
}
