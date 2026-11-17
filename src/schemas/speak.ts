import { z } from "zod";
import { CEFRLevelSchema } from "./lesson";

export const PronunciationFocusSchema = z.enum([
  "general",
  "th-sounds",
  "contractions",
  "vowels",
  "tech-pitch",
]);

const PronunciationExerciseContentSchema = z.object({
  sentence_en: z.string().trim().min(8).max(240),
  translation_fr: z.string().trim().min(8).max(300),
  phonetic_tip_fr: z.string().trim().min(5).max(300),
  target_sounds: z.array(z.string().trim().min(1).max(60)).min(1).max(4),
});

export const PronunciationExerciseSchema =
  PronunciationExerciseContentSchema.extend({
    id: z.string().uuid(),
  });

export const PronunciationExerciseContentOutputSchema =
  PronunciationExerciseContentSchema;

export const SpeakActionInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("generate"),
    cefrLevel: CEFRLevelSchema,
    focus: PronunciationFocusSchema,
  }),
  z.object({
    action: z.literal("record"),
    sentenceEn: z.string().trim().min(1).max(240),
    spokenText: z.string().trim().min(1).max(1000),
    accuracyPct: z.number().finite().min(0).max(100),
  }),
]);

export type PronunciationFocus = z.infer<typeof PronunciationFocusSchema>;
export type PronunciationExercise = z.infer<
  typeof PronunciationExerciseSchema
>;
export type SpeakActionInput = z.infer<typeof SpeakActionInputSchema>;
