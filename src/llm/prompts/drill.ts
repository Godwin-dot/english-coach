import type { CEFRLevel } from "@/schemas/lesson";

export function buildGenerateDictationPrompt({
  cefrLevel,
  topic,
}: {
  cefrLevel: CEFRLevel;
  topic?: string;
}): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt: [
      "You create listening dictation exercises for French-speaking English learners.",
      "Return only one valid JSON object matching the requested schema.",
      "Write one natural spoken English sentence containing 8 to 18 words, suitable for the specified CEFR level.",
      "Prefer connected speech, a common contraction, or a potentially confusing sound without making the sentence unnatural.",
      "Provide a faithful, fluent French translation and a short useful phonetic note in French.",
      topic
        ? `Use this learner-selected theme: ${topic}.`
        : "Choose a practical everyday or work-related theme.",
    ].join(" "),
    userPrompt: JSON.stringify({
      cefrLevel,
      topic: topic || null,
      requiredShape: {
        sentence_en: "Natural spoken English sentence of 8-18 words",
        translation_fr: "Faithful and natural French translation",
        focus_note_fr: "Short French note about a contraction or pronunciation point",
      },
    }),
  };
}

export type RecentMistakePrompt = {
  category: string | null;
  userText: string;
  correction: string;
};

export function buildGenerateDrillPrompts({
  cefrLevel,
  interests,
  topic,
  targetWords,
  recentMistakes,
}: {
  cefrLevel: CEFRLevel;
  interests: string[];
  topic?: string;
  targetWords: string[];
  recentMistakes: RecentMistakePrompt[];
}): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt: [
      "You are a supportive French-to-English translation teacher.",
      "Return only one valid JSON object matching the requested schema.",
      "Write one natural, realistic French sentence between 12 and 25 words, tailored to the learner's CEFR level and interests.",
      "When target English vocabulary is provided, naturally encode the meaning of at least one or two terms so the learner must retrieve them actively; never show the English answer in the French sentence.",
      "When recent mistakes are provided, subtly practice the recurring grammar structure or trap without copying the mistake verbatim.",
      "Provide a short French hint that does not reveal the translation, and name the grammar focus.",
      "Use an empty target_vocab array only when no target vocabulary is supplied; otherwise return one to three supplied terms.",
      topic
        ? `Make the French sentence explicitly about this learner-selected theme or situation: ${topic}.`
        : "Choose a relevant theme from the learner's configured interests.",
    ].join(" "),
    userPrompt: JSON.stringify({
      cefrLevel,
      interests,
      topic: topic || null,
      targetWords,
      recentMistakes,
      requiredShape: {
        french_sentence: "A natural French sentence of 12-25 words",
        target_vocab: ["One to three target English terms, or [] if none supplied"],
        focus_grammar: "Short name for the grammar structure being practiced",
        hint_fr: "A brief French hint that does not give the answer",
      },
    }),
  };
}

export function buildEvaluateDrillPrompts({
  frenchSentence,
  userTranslation,
  targetVocab,
  cefrLevel,
}: {
  frenchSentence: string;
  userTranslation: string;
  targetVocab: string[];
  cefrLevel: CEFRLevel;
}): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt: [
      "You are a kind but exacting English teacher for a French-speaking learner.",
      "Return only one valid JSON object matching the requested schema.",
      "Judge meaning and naturalness at the learner's CEFR level; accept valid synonyms and different correct constructions.",
      "Identify genuine errors and awkward calques, especially tense, articles, prepositions, word order, and target vocabulary usage.",
      "Give a score from 0 to 10 in increments of 0.5, an idiomatic reference translation, one valid alternative, and clear constructive feedback in French.",
      "Only add detected_mistakes for genuine errors or awkward phrasing; return an empty array when the translation is correct and natural.",
      "For each detected mistake, quote a short exact fragment from the learner's text, provide its correction, category, and a concise French explanation.",
      "In missed_vocab, extract only an isolated English word or a very short expression of 1 to 2 words that the learner omitted, misspelled, or replaced with a false friend (for example: 'rely on', 'schedule', 'accurate'). Never include a clause or sentence fragment as a term. Give its French meaning, a corrected English context_sentence, and a short French note. Return at most 3 entries and [] when no specific vocabulary item was missed.",
    ].join(" "),
    userPrompt: JSON.stringify({
      frenchSentence,
      userTranslation,
      targetVocab,
      cefrLevel,
      requiredShape: {
        score: "Number from 0 to 10 in increments of 0.5",
        is_natural: "Whether the user's translation is idiomatic English",
        ideal_translation: "Natural, faithful English reference",
        alternative_translation: "Another correct formulation",
        feedback_fr: "Precise and encouraging French feedback",
        detected_mistakes: [
          {
            user_fragment: "Exact short fragment from userTranslation",
            correction: "Corrected phrase",
            category: "Grammar or vocabulary category",
            explanation: "Brief pedagogical explanation in French",
          },
        ],
        missed_vocab: [
          {
            term: "One missed isolated English word or short expression (1-2 words; never a clause or sentence)",
            translation: "French meaning",
            context_sentence: "Corrected complete English example sentence using the term",
            note_fr: "Brief French note about the mistake",
          },
        ],
      },
    }),
  };
}
