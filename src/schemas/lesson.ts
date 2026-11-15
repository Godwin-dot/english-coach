import { z } from "zod";

export const CEFRLevelSchema = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);

export const GenerateLessonInputSchema = z.object({
  topic: z.string().trim().min(2).max(120),
  cefrLevel: CEFRLevelSchema,
});

export const KeywordItemSchema = z.object({
  term: z.string().trim().min(1),
  translation: z.string().trim().min(1),
  phonetic: z.string().trim(),
  example: z.string().trim().min(1),
  example_fr: z.string().trim().min(1),
});

export const QuizQuestionSchema = z.object({
  question: z.string().trim().min(1),
  options: z.array(z.string().trim().min(1)).length(4),
  answer_index: z.number().int().min(0).max(3),
  explanation: z.string().trim().min(1),
});

export const GeneratedLessonPayloadSchema = z.object({
  content_en: z.string().trim().min(1),
  content_fr: z.string().trim().min(1),
  keywords: z.array(KeywordItemSchema).length(5),
  quiz: z.array(QuizQuestionSchema).length(3),
});

export const LookupWordInputSchema = z.object({
  word: z.string().trim().min(1).max(60),
  contextSentence: z.string().trim().min(1),
  cefrLevel: CEFRLevelSchema,
});

export type CEFRLevel = z.infer<typeof CEFRLevelSchema>;
export type GenerateLessonInput = z.infer<typeof GenerateLessonInputSchema>;
export type KeywordItem = z.infer<typeof KeywordItemSchema>;
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export type GeneratedLessonPayload = z.infer<
  typeof GeneratedLessonPayloadSchema
>;
