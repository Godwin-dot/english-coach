import { inArray } from "drizzle-orm";
import { AppShell } from "@/components/AppShell";
import { getPublicLLMConfig } from "@/domain/llm-config";
import { getReviewableCardCount } from "@/domain/cards";
import { getLessonById, listRecentLessons } from "@/domain/lessons";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { CEFRLevelSchema } from "@/schemas/lesson";
import { isPasswordAuthEnabled } from "@/lib/auth";
import { LessonWorkspace } from "./LessonWorkspace";

export const dynamic = "force-dynamic";

function readSetting(values: Map<string, string>, key: string): unknown {
  const value = values.get(key);
  if (value === undefined) {
    throw new Error(`Missing required application setting: ${key}`);
  }
  return JSON.parse(value) as unknown;
}

export default async function LessonPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; settings?: string; topic?: string }>;
}) {
  const params = await searchParams;
  const settingsRows = db
    .select()
    .from(settings)
    .where(inArray(settings.key, ["target_level", "interests"]))
    .all();
  const values = new Map(
    settingsRows.map(({ key, value }) => [key, value]),
  );
  const targetLevel = CEFRLevelSchema.parse(
    readSetting(values, "target_level"),
  );
  const interests = readSetting(values, "interests");

  if (
    !Array.isArray(interests) ||
    !interests.every((interest: unknown) => typeof interest === "string")
  ) {
    throw new Error("The interests setting has an invalid format.");
  }

  const id = params.id ? Number(params.id) : Number.NaN;
  const lesson =
    Number.isSafeInteger(id) && id > 0 ? getLessonById(id) : null;
  const llmConfig = getPublicLLMConfig();

  return (
    <AppShell
      targetLevel={targetLevel}
      dueCount={getReviewableCardCount()}
      hasProviderKey={
        llmConfig.hasGeminiKey || llmConfig.hasOpenrouterKey
      }
      passwordAuthEnabled={isPasswordAuthEnabled()}
    >
      <LessonWorkspace
        initialLesson={lesson}
        recentLessons={listRecentLessons(10)}
        interests={interests}
        targetLevel={targetLevel}
        initialTopic={params.topic ?? ""}
        hasProviderKey={
          llmConfig.hasGeminiKey || llmConfig.hasOpenrouterKey
        }
        openConfigInitially={
          !llmConfig.hasGeminiKey && !llmConfig.hasOpenrouterKey
        }
        requestedLessonId={params.id ?? null}
      />
    </AppShell>
  );
}
