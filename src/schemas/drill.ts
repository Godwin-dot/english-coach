import { z } from "zod";
import { MissedVocabItemSchema } from "./card";
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
  missed_vocab: z.array(MissedVocabItemSchema).max(3),
});

export const DictationExerciseSchema = z.object({
  id: z.string().uuid(),
  sentence_en: z.string().trim().min(1).max(500),
  translation_fr: z.string().trim().min(1).max(500),
  focus_note_fr: z.string().trim().max(300),
  cefr_level: CEFRLevelSchema,
  topic: z.string().trim().max(120).nullable(),
});

export const GeneratedDictationContentSchema = z.object({
  sentence_en: z.string().trim().min(1).max(500),
  translation_fr: z.string().trim().min(1).max(500),
  focus_note_fr: z.string().trim().max(300).default(""),
});

export const DictationGenerateInputSchema = z.object({
  action: z.literal("generate"),
  cefrLevel: CEFRLevelSchema.optional(),
  topic: z.string().trim().max(120).optional(),
});

export const DictationRecordInputSchema = z.object({
  action: z.literal("record"),
  sentenceEn: z.string().trim().min(1).max(500),
  userAttempt: z.string().trim().min(1).max(1000),
  accuracyPct: z.number().finite().min(0).max(100),
});

export const DictationActionInputSchema = z.discriminatedUnion("action", [
  DictationGenerateInputSchema,
  DictationRecordInputSchema,
]);

export type GeneratedDrillPrompt = z.infer<typeof GeneratedDrillPromptSchema>;
export type GenerateDrillInput = z.infer<typeof GenerateDrillInputSchema>;
export type EvaluateDrillInput = z.infer<typeof EvaluateDrillInputSchema>;
export type DrillEvaluationResult = z.infer<
  typeof DrillEvaluationResultSchema
>;
export type DictationExercise = z.infer<typeof DictationExerciseSchema>;
export type DictationRecordInput = z.infer<typeof DictationRecordInputSchema>;
