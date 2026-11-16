import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activityLog, cards, lessons, mistakes } from "@/db/schema";

export type HistoryCard = Omit<
  typeof cards.$inferSelect,
  "fsrsStateJson"
> & { isDue: boolean };

export type DrillHistoryEntry = {
  id: number;
  frenchSentence: string;
  userTranslation: string;
  score: number | null;
  createdAt: string;
};

function parseDrillMetadata(
  metaJson: string | null,
): { frenchSentence: string; userTranslation: string } {
  if (!metaJson) {
    return { frenchSentence: "", userTranslation: "" };
  }
  try {
    const metadata: unknown = JSON.parse(metaJson);
    if (typeof metadata !== "object" || metadata === null) {
      return { frenchSentence: "", userTranslation: "" };
    }
    return {
      frenchSentence:
        "frenchSentence" in metadata &&
        typeof metadata.frenchSentence === "string"
          ? metadata.frenchSentence
          : "",
      userTranslation:
        "userTranslation" in metadata &&
        typeof metadata.userTranslation === "string"
          ? metadata.userTranslation
          : "",
    };
  } catch {
    return { frenchSentence: "", userTranslation: "" };
  }
}

export function getFullHistory(now = new Date()) {
  const allCards = db
    .select()
    .from(cards)
    .orderBy(desc(cards.createdAt), desc(cards.id))
    .all()
    .map(({ fsrsStateJson: _, ...card }) => ({
      ...card,
      isDue: card.due <= now.toISOString(),
    }));

  const drillHistory: DrillHistoryEntry[] = db
    .select()
    .from(activityLog)
    .where(eq(activityLog.kind, "drill"))
    .orderBy(desc(activityLog.createdAt), desc(activityLog.id))
    .all()
    .map((entry) => ({
      id: entry.id,
      ...parseDrillMetadata(entry.metaJson),
      score: entry.score,
      createdAt: entry.createdAt,
    }));

  const allLessons = db
    .select()
    .from(lessons)
    .orderBy(desc(lessons.createdAt), desc(lessons.id))
    .all();

  const allMistakes = db
    .select()
    .from(mistakes)
    .orderBy(desc(mistakes.createdAt), desc(mistakes.id))
    .all();

  return { allCards, drillHistory, allLessons, allMistakes };
}
