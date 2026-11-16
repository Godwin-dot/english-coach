import { z } from "zod";

export const GenerateMistakeQuizInputSchema = z.object({
  category: z.string().trim().max(80).optional(),
});

export const MistakeQuizQuestionSchema = z.object({
  prompt_en: z.string().trim().min(1).max(400),
  context_fr: z.string().trim().min(1).max(240),
  options: z
    .tuple([
      z.string().trim().min(1).max(160),
      z.string().trim().min(1).max(160),
      z.string().trim().min(1).max(160),
    ])
    .refine(
      (options) =>
        new Set(options.map((option) => option.toLocaleLowerCase("en"))).size ===
        options.length,
      "Les trois réponses doivent être distinctes.",
    ),
  correct_index: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  explanation_fr: z.string().trim().min(1).max(400),
});

export const GeneratedMistakeQuizSchema = z.object({
  title_fr: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80),
  questions: z.array(MistakeQuizQuestionSchema).length(4),
});

export const CompleteMistakeQuizInputSchema = z.object({
  category: z.string().trim().min(1).max(80),
  score: z.number().min(0).max(10),
  duration_s: z.number().int().min(0).optional(),
});

export type GenerateMistakeQuizInput = z.infer<
  typeof GenerateMistakeQuizInputSchema
>;
export type MistakeQuizQuestion = z.infer<typeof MistakeQuizQuestionSchema>;
export type GeneratedMistakeQuiz = z.infer<typeof GeneratedMistakeQuizSchema>;
export type CompleteMistakeQuizInput = z.infer<
  typeof CompleteMistakeQuizInputSchema
>;
