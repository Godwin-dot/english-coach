import { z } from "zod";
import { CEFRLevelSchema } from "./lesson";

export const AppSettingsSchema = z.object({
  dailyNewCards: z.number().int().min(0).max(100),
  dailyReviewCap: z.number().int().min(0).max(500),
  weeklyGoalDays: z.number().int().min(1).max(7),
  targetLevel: CEFRLevelSchema,
  interests: z
    .array(z.string().trim().min(1).max(60))
    .max(12)
    .refine(
      (interests) =>
        new Set(interests.map((interest) => interest.toLocaleLowerCase("fr"))).size ===
        interests.length,
      "Les centres d’intérêt doivent être uniques.",
    ),
});

export type AppSettings = z.infer<typeof AppSettingsSchema>;
