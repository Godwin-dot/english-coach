import { z } from "zod";

export const CEFRLevelSchema = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);

export const GenerateLessonInputSchema = z.object({
  topic: z.string().trim().min(2).max(120),
  cefrLevel: CEFRLevelSchema,
});

export const ImportLessonInputSchema = z.object({
  title: z.string().trim().max(120).optional(),
  text: z
    .string()
    .trim()
    .min(80, "Le texte doit contenir au moins 80 caractères.")
    .max(3500, "Le texte ne doit pas dépasser 3 500 caractères."),
});

export const KeywordItemSchema = z.object({
  term: z.string().trim().min(1),
  translation: z.string().trim().min(1),
  phonetic: z.string().trim(),
  example: z.string().trim().min(1),
  example_fr: z.string().trim().min(1),
});

export const LessonKeywordItemSchema = KeywordItemSchema.extend({
  example_fr: z.string().trim().min(1).optional(),
  mnemonic: z.string().trim().min(1).optional(),
});

export const QuizQuestionSchema = z.object({
  question: z.string().trim().min(1),
  options: z.array(z.string().trim().min(1)).length(4),
  answer_index: z.number().int().min(0).max(3),
  explanation: z.string().trim().min(1),
});

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function firstPresent(record: JsonRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return undefined;
}

function normalizeImportedLessonAnalysis(value: unknown): unknown {
  let source = asRecord(value);
  if (!source) return value;
  for (const wrapper of ["analysis", "result", "data"]) {
    const wrapped = asRecord(source[wrapper]);
    if (wrapped) {
      source = wrapped;
      break;
    }
  }

  const rawVocabulary = firstPresent(source, [
    "key_vocab",
    "keyVocabulary",
    "keywords",
    "vocabulary",
  ]);
  const rawQuiz = firstPresent(source, ["quiz", "questions", "comprehension"]);

  return {
    title_en: firstPresent(source, ["title_en", "title", "lesson_title"]),
    translation_fr: firstPresent(source, [
      "translation_fr",
      "french_translation",
      "translation",
    ]),
    key_vocab: Array.isArray(rawVocabulary)
      ? rawVocabulary.map((item) => {
          const word = asRecord(item);
          if (!word) return item;
          return {
            term: firstPresent(word, ["term", "word", "phrase"]),
            translation: firstPresent(word, [
              "translation",
              "meaning_fr",
              "translation_fr",
              "meaning",
            ]),
            example_sentence: firstPresent(word, [
              "example_sentence",
              "example",
              "example_en",
              "context",
            ]),
            example_sentence_fr: firstPresent(word, [
              "example_sentence_fr",
              "example_fr",
              "example_translation",
            ]),
            mnemonic: firstPresent(word, [
              "mnemonic",
              "memory_tip",
              "memory_aid",
            ]),
          };
        })
      : rawVocabulary,
    quiz: Array.isArray(rawQuiz)
      ? rawQuiz.map((item) => {
          const question = asRecord(item);
          if (!question) return item;
          const rawIndex = firstPresent(question, [
            "correct_index",
            "answer_index",
            "correctAnswer",
            "correct_option",
          ]);
          return {
            question_en: firstPresent(question, [
              "question_en",
              "question",
              "prompt",
            ]),
            options: firstPresent(question, ["options", "choices", "answers"]),
            correct_index: rawIndex,
            explanation_fr: firstPresent(question, [
              "explanation_fr",
              "explanation",
              "rationale_fr",
            ]),
          };
        })
      : rawQuiz,
  };
}

export const ImportedLessonAnalysisSchema = z.preprocess(
  normalizeImportedLessonAnalysis,
  z.object({
    title_en: z.string().trim().min(1).max(160),
    translation_fr: z.string().trim().min(5),
    key_vocab: z
      .array(
        z.object({
          term: z.string().trim().min(1).max(80),
          translation: z.string().trim().min(1),
          example_sentence: z.string().trim().min(1),
          example_sentence_fr: z.string().trim().min(1).optional(),
          mnemonic: z.string().trim().default(""),
        }),
      )
      .min(2)
      .max(8),
    quiz: z
      .array(
        z.object({
          question_en: z.string().trim().min(3),
          options: z
            .array(z.string().trim().min(1))
            .min(2)
            .max(4),
          correct_index: z.coerce.number().int().min(0).max(3),
          explanation_fr: z.string().trim().default(""),
        }),
      )
      .min(2)
      .max(5),
  }),
);

const FlexibleQuizQuestionSchema = z.object({
  question: z.string().trim().min(1),
  options: z.array(z.string().trim().min(1)).min(2).max(4),
  answer_index: z.number().int().min(0).max(3),
  explanation: z.string().trim().min(1),
}).refine((question) => question.answer_index < question.options.length);

export const GeneratedLessonPayloadSchema = z.object({
  content_en: z.string().trim().min(1),
  content_fr: z.string().trim().min(1),
  keywords: z.array(KeywordItemSchema).length(5),
  quiz: z.array(QuizQuestionSchema).length(3),
});

export const LessonViewPayloadSchema = z.object({
  content_en: z.string().trim().min(1),
  content_fr: z.string().trim().min(1),
  keywords: z.array(LessonKeywordItemSchema).min(2).max(8),
  quiz: z.array(z.union([QuizQuestionSchema, FlexibleQuizQuestionSchema])).min(2).max(5),
});

export const LookupWordInputSchema = z.object({
  word: z.string().trim().min(1).max(60),
  contextSentence: z.string().trim().min(1),
  cefrLevel: CEFRLevelSchema,
});

export type CEFRLevel = z.infer<typeof CEFRLevelSchema>;
export type GenerateLessonInput = z.infer<typeof GenerateLessonInputSchema>;
export type ImportLessonInput = z.infer<typeof ImportLessonInputSchema>;
export type KeywordItem = z.infer<typeof KeywordItemSchema>;
export type LessonKeywordItem = z.infer<typeof LessonKeywordItemSchema>;
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export type GeneratedLessonPayload = z.infer<
  typeof GeneratedLessonPayloadSchema
>;
export type LessonViewPayload = z.infer<typeof LessonViewPayloadSchema>;
export type ImportedLessonAnalysis = z.infer<
  typeof ImportedLessonAnalysisSchema
>;
