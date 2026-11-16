import { z } from "zod";

export const MissedVocabItemSchema = z.object({
  term: z.string().trim().min(1).max(80),
  translation: z.string().trim().min(1).max(200),
  context_sentence: z.string().trim().min(1).max(500),
  note_fr: z.string().trim().max(500),
});

export const DiscoveredVocabItemSchema = z.object({
  term: z.string().trim().min(1).max(80),
  translation: z.string().trim().min(1).max(200),
  part_of_speech: z.string().trim().min(1).max(80),
  example_sentence: z.string().trim().min(1).max(500),
  example_translation: z.string().trim().min(1).max(500),
  mnemonic: z.string().trim().max(500),
});

export const DiscoveredVocabBatchSchema = z.object({
  words: z
    .array(DiscoveredVocabItemSchema)
    .min(4)
    .max(8)
    .refine(
      (words) =>
        new Set(words.map(({ term }) => term.toLocaleLowerCase("en"))).size ===
        words.length,
      "Les mots du lot doivent être uniques.",
    ),
});

const ShortVocabTermSchema = z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine((term) => term.split(/\s+/u).length <= 2)
    .refine((term) => !/[.!?]$/u.test(term));

export const DiscoverVocabRequestSchema = z.object({
  excludeTerms: z.array(z.string().trim().min(1).max(80)).max(500).optional(),
});

export const CreateCardInputSchema = z.object({
  term: z.string().trim().min(1).max(80),
  translation: z.string().trim().min(1).max(200),
  phonetic: z.string().trim().max(100).nullable().optional(),
  example_sentence: z.string().trim().min(1).max(500),
  example_translation: z.string().trim().min(1).max(500),
  mnemonic: z.string().trim().max(500).nullable().optional(),
  source_lesson_id: z.number().int().positive().nullable().optional(),
});

const SubmitReviewFieldsSchema = z.object({
  rating: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
  duration_s: z.number().int().nonnegative().optional(),
});

export const SubmitReviewInputSchema = z.union([
  SubmitReviewFieldsSchema.extend({
    cardId: z.number().int().positive(),
    mode: z.enum(["due", "continuous"]).optional(),
  }),
  SubmitReviewFieldsSchema.extend({
    discoveryCard: DiscoveredVocabItemSchema.extend({
      term: ShortVocabTermSchema,
    }),
  }),
]);

export type CreateCardInput = z.infer<typeof CreateCardInputSchema>;
export type SubmitReviewInput = z.infer<typeof SubmitReviewInputSchema>;
export type MissedVocabItem = z.infer<typeof MissedVocabItemSchema>;
export type DiscoveredVocabItem = z.infer<typeof DiscoveredVocabItemSchema>;
