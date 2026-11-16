import { z } from "zod";

export const CreateCardInputSchema = z.object({
  term: z.string().trim().min(1).max(80),
  translation: z.string().trim().min(1).max(200),
  phonetic: z.string().trim().max(100).nullable().optional(),
  example_sentence: z.string().trim().min(1).max(500),
  example_translation: z.string().trim().min(1).max(500),
  mnemonic: z.string().trim().max(500).nullable().optional(),
  source_lesson_id: z.number().int().positive().nullable().optional(),
});

export const SubmitReviewInputSchema = z.object({
  cardId: z.number().int().positive(),
  rating: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
  duration_s: z.number().int().nonnegative().optional(),
  mode: z.enum(["due", "continuous"]).optional(),
});

export type CreateCardInput = z.infer<typeof CreateCardInputSchema>;
export type SubmitReviewInput = z.infer<typeof SubmitReviewInputSchema>;
