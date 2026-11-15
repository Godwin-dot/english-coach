import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { activityLog, lessons } from "@/db/schema";
import {
  GeneratedLessonPayloadSchema,
  type CEFRLevel,
  type GeneratedLessonPayload,
} from "@/schemas/lesson";
import { getLLMProvider } from "@/llm/provider";
import { LLMProviderError } from "@/llm/errors";
import { lessonPrompts } from "@/llm/prompts/lesson";

export type LessonView = GeneratedLessonPayload & {
  id: number;
  topic: string;
  cefrLevel: string;
  createdAt: string;
  completedAt: string | null;
};

export type RecentLesson = Pick<
  LessonView,
  "id" | "topic" | "cefrLevel" | "createdAt"
>;

export class LessonNotFoundError extends Error {
  constructor() {
    super("Leçon introuvable.");
    this.name = "LessonNotFoundError";
  }
}

function toLessonView(
  row: typeof lessons.$inferSelect,
): LessonView {
  const payload = GeneratedLessonPayloadSchema.parse({
    content_en: row.contentEn,
    content_fr: row.contentFr,
    keywords: JSON.parse(row.keywordsJson) as unknown,
    quiz: JSON.parse(row.quizJson) as unknown,
  });

  return {
    id: row.id,
    topic: row.topic,
    cefrLevel: row.cefrLevel,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    ...payload,
  };
}

export async function createAndSaveLesson(
  topic: string,
  cefrLevel: CEFRLevel,
): Promise<LessonView> {
  const prompts = lessonPrompts(topic, cefrLevel);
  const payload = await getLLMProvider().generateStructuredJSON(
    prompts.systemPrompt,
    prompts.userPrompt,
    GeneratedLessonPayloadSchema,
  );
  const wordCount = payload.content_en.trim().split(/\s+/u).length;
  if (wordCount < 120 || wordCount > 180) {
    throw new LLMProviderError(
      "Le texte généré ne respecte pas la longueur demandée (120 à 180 mots).",
    );
  }
  const now = new Date().toISOString();
  const row = db
    .insert(lessons)
    .values({
      topic,
      cefrLevel,
      contentEn: payload.content_en,
      contentFr: payload.content_fr,
      keywordsJson: JSON.stringify(payload.keywords),
      quizJson: JSON.stringify(payload.quiz),
      createdAt: now,
    })
    .returning()
    .get();

  return toLessonView(row);
}

export function getLessonById(id: number): LessonView | null {
  const row = db.select().from(lessons).where(eq(lessons.id, id)).get();
  return row ? toLessonView(row) : null;
}

export function listRecentLessons(limit = 10): RecentLesson[] {
  const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), 50);
  return db
    .select({
      id: lessons.id,
      topic: lessons.topic,
      cefrLevel: lessons.cefrLevel,
      createdAt: lessons.createdAt,
    })
    .from(lessons)
    .orderBy(desc(lessons.createdAt), desc(lessons.id))
    .limit(boundedLimit)
    .all();
}

export function markLessonCompleted(
  lessonId: number,
  quizScore: number,
): { completedAt: string; score: number } {
  return db.transaction((transaction) => {
    const lesson = transaction
      .select({
        completedAt: lessons.completedAt,
        topic: lessons.topic,
      })
      .from(lessons)
      .where(eq(lessons.id, lessonId))
      .get();

    if (!lesson) {
      throw new LessonNotFoundError();
    }

    if (lesson.completedAt) {
      return { completedAt: lesson.completedAt, score: quizScore };
    }

    const completedAt = new Date().toISOString();
    transaction
      .update(lessons)
      .set({ completedAt })
      .where(and(eq(lessons.id, lessonId), isNull(lessons.completedAt)))
      .run();
    transaction
      .insert(activityLog)
      .values({
        kind: "lesson_completed",
        refId: lessonId,
        score: quizScore,
        metaJson: JSON.stringify({ topic: lesson.topic }),
        createdAt: completedAt,
      })
      .run();

    return { completedAt, score: quizScore };
  });
}

