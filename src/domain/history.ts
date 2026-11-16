import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activityLog, cards, lessons, mistakes } from "@/db/schema";

export type HistoryCard = Omit<
  typeof cards.$inferSelect,
  "fsrsStateJson"
> & {
  isDue: boolean;
  reps: number;
  intervalDays: number;
  fsrsState: number;
};

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
    .map(({ fsrsStateJson, ...card }) => {
      let reps = 0;
      let intervalDays = 0;
      let fsrsState = 0;
      try {
        const state: unknown = JSON.parse(fsrsStateJson);
        if (typeof state === "object" && state !== null) {
          if ("reps" in state && typeof state.reps === "number") reps = state.reps;
          if (
            "scheduled_days" in state &&
            typeof state.scheduled_days === "number"
          ) {
            intervalDays = state.scheduled_days;
          }
          if ("state" in state && typeof state.state === "number") {
            fsrsState = state.state;
          }
        }
      } catch {
        // Keep history readable if a legacy card has malformed FSRS metadata.
      }
      return {
        ...card,
        isDue: card.due <= now.toISOString(),
        reps,
        intervalDays,
        fsrsState,
      };
    });

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
