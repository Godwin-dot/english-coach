import { z } from "zod";
import { CEFRLevelSchema } from "./lesson";

export const GeneratedDrillPromptSchema = z.object({
  french_sentence: z.string().trim().min(1).max(500),
  target_vocab: z.array(z.string().trim().min(1).max(80)).max(3),
  focus_grammar: z.string().trim().min(1).max(160),
  hint_fr: z.string().trim().max(240).optional().default(""),
});

export const GenerateDrillInputSchema = z.object({
  topic: z.string().trim().max(120).optional(),
  cefrLevel: CEFRLevelSchema.optional(),
});

export const EvaluateDrillInputSchema = z.object({
  frenchSentence: z.string().trim().min(3).max(500),
  userTranslation: z.string().trim().min(1).max(500),
  targetVocab: z.array(z.string().trim().min(1).max(80)).max(3),
  cefrLevel: CEFRLevelSchema,
  duration_s: z.number().int().min(0).optional(),
});

export const DrillEvaluationResultSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(10)
    .refine((score) => Number.isInteger(score * 2), "La note doit avancer par demi-point."),
  is_natural: z.boolean(),
  ideal_translation: z.string().trim().min(1).max(500),
  alternative_translation: z.string().trim().min(1).max(500),
  feedback_fr: z.string().trim().min(1).max(1500),
  detected_mistakes: z.array(
    z.object({
      user_fragment: z.string().trim().min(1).max(250),
      correction: z.string().trim().min(1).max(250),
      category: z.string().trim().min(1).max(80),
      explanation: z.string().trim().min(1).max(500),
    }),
  ),
  missed_vocab: z
    .array(
      z.object({
        term: z.string().trim().min(1).max(80),
        translation: z.string().trim().min(1).max(200),
        context_sentence: z.string().trim().min(1).max(500),
        note_fr: z.string().trim().max(500),
      }),
    )
    .max(3),
});

export type GeneratedDrillPrompt = z.infer<typeof GeneratedDrillPromptSchema>;
export type GenerateDrillInput = z.infer<typeof GenerateDrillInputSchema>;
export type EvaluateDrillInput = z.infer<typeof EvaluateDrillInputSchema>;
export type DrillEvaluationResult = z.infer<
  typeof DrillEvaluationResultSchema
>;
