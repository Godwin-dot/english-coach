import { z } from "zod";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { AppSettingsSchema, type AppSettings } from "@/schemas/settings";

function parseSetting<T>(
  key: string,
  rawValue: string | undefined,
  schema: z.ZodType<T>,
  fallback: T,
): T {
  if (rawValue === undefined) {
    return fallback;
  }

  let value: unknown;
  try {
    value = JSON.parse(rawValue) as unknown;
  } catch {
    throw new Error(`The ${key} setting contains invalid JSON.`);
  }

  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`The ${key} setting has an invalid value.`);
  }
  return parsed.data;
}

export function getAppSettings(): AppSettings {
  const rows = db.select().from(settings).all();
  const values = new Map(rows.map(({ key, value }) => [key, value]));

  return AppSettingsSchema.parse({
    dailyNewCards: parseSetting(
      "daily_new_cards",
      values.get("daily_new_cards"),
      AppSettingsSchema.shape.dailyNewCards,
      10,
    ),
    dailyReviewCap: parseSetting(
      "daily_review_cap",
      values.get("daily_review_cap"),
      AppSettingsSchema.shape.dailyReviewCap,
      15,
    ),
    weeklyGoalDays: parseSetting(
      "weekly_goal_days",
      values.get("weekly_goal_days"),
      AppSettingsSchema.shape.weeklyGoalDays,
      5,
    ),
    targetLevel: parseSetting(
      "target_level",
      values.get("target_level"),
      AppSettingsSchema.shape.targetLevel,
      "B1",
    ),
    interests: parseSetting(
      "interests",
      values.get("interests"),
      AppSettingsSchema.shape.interests,
      ["développement logiciel", "littérature"],
    ),
  });
}

export function updateAppSettings(input: AppSettings): AppSettings {
  const validated = AppSettingsSchema.parse(input);
  const values = [
    ["daily_new_cards", validated.dailyNewCards],
    ["daily_review_cap", validated.dailyReviewCap],
    ["weekly_goal_days", validated.weeklyGoalDays],
    ["target_level", validated.targetLevel],
    ["interests", validated.interests],
  ] as const;

  db.transaction((transaction) => {
    for (const [key, value] of values) {
      transaction
        .insert(settings)
        .values({ key, value: JSON.stringify(value) })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: JSON.stringify(value) },
        })
        .run();
    }
  });

  return getAppSettings();
}
