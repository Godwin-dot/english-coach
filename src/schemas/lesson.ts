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

export const ImportedLessonAnalysisSchema = z.object({
  title_en: z.string().trim().min(2).max(120),
  translation_fr: z.string().trim().min(20),
  key_vocab: z
    .array(
      z.object({
        term: z
          .string()
          .trim()
          .min(1)
          .refine((term) => term.split(/\s+/u).length <= 3),
        translation: z.string().trim().min(1),
        example_sentence: z.string().trim().min(1),
        example_sentence_fr: z.string().trim().min(1).optional(),
        mnemonic: z.string().trim().min(1),
      }),
    )
    .min(3)
    .max(6),
  quiz: z
    .array(
      z.object({
        question_en: z.string().trim().min(1),
        options: z.tuple([
          z.string().trim().min(1),
          z.string().trim().min(1),
          z.string().trim().min(1),
        ]),
        correct_index: z.union([z.literal(0), z.literal(1), z.literal(2)]),
        explanation_fr: z.string().trim().min(1),
      }),
    )
    .length(3),
});

const ThreeOptionQuizQuestionSchema = z.object({
  question: z.string().trim().min(1),
  options: z.tuple([
    z.string().trim().min(1),
    z.string().trim().min(1),
    z.string().trim().min(1),
  ]),
  answer_index: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  explanation: z.string().trim().min(1),
});

export const GeneratedLessonPayloadSchema = z.object({
  content_en: z.string().trim().min(1),
  content_fr: z.string().trim().min(1),
  keywords: z.array(KeywordItemSchema).length(5),
  quiz: z.array(QuizQuestionSchema).length(3),
});

export const LessonViewPayloadSchema = z.object({
  content_en: z.string().trim().min(1),
  content_fr: z.string().trim().min(1),
  keywords: z.array(LessonKeywordItemSchema).min(3).max(6),
  quiz: z
    .array(z.union([QuizQuestionSchema, ThreeOptionQuizQuestionSchema]))
    .length(3),
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
