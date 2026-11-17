import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  lte,
} from "drizzle-orm";
import { db } from "@/db";
import { activityLog, cards, lessons } from "@/db/schema";
import type { AppSettings } from "@/schemas/settings";

export type DashboardDay = {
  date: string;
  label: string;
  active: boolean;
  isToday: boolean;
};

export type HeatmapDay = {
  date: string;
  count: number;
  minutes: number;
  level: 0 | 1 | 2 | 3;
};

export type DeckBreakdown = {
  total: number;
  fresh: number;
  learning: number;
  mastered: number;
};

export type RecentAverageScore = {
  currentAvg: number | null;
  delta: number | null;
  sampleCount: number;
};

export type DashboardStats = {
  totalCards: number;
  totalDueCards: number;
  reviewableCards: number;
  newCardsToday: number;
  reviewsToday: number;
  lessonsCompletedToday: number;
  activeDaysThisWeek: number;
  weeklyDays: DashboardDay[];
  heatmap84d: HeatmapDay[];
  activeDays84d: number;
  deckBreakdown: DeckBreakdown;
  recentAverageScore: RecentAverageScore;
  weeklyStudyMinutes: number;
};

function countRows(query: { get: () => { value: number } | undefined }): number {
  return query.get()?.value ?? 0;
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function readFSRSState(value: string): { reps: number; stability: number } | null {
  try {
    const state: unknown = JSON.parse(value);
    if (typeof state !== "object" || state === null) return null;
    if (
      !("reps" in state) ||
      typeof state.reps !== "number" ||
      !Number.isFinite(state.reps) ||
      !("stability" in state) ||
      typeof state.stability !== "number" ||
      !Number.isFinite(state.stability)
    ) {
      return null;
    }
    return { reps: state.reps, stability: state.stability };
  } catch {
    return null;
  }
}

export function getDashboardStats(
  appSettings: AppSettings,
  now = new Date(),
): DashboardStats {
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
  const weekStart = new Date(todayStart);
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const todayStartIso = todayStart.toISOString();
  const tomorrowStartIso = tomorrowStart.toISOString();
  const weekStartIso = weekStart.toISOString();
  const weekEndIso = weekEnd.toISOString();
  const nowIso = now.toISOString();
  const heatmapStart = new Date(todayStart);
  heatmapStart.setUTCDate(heatmapStart.getUTCDate() - 83);
  const heatmapStartIso = heatmapStart.toISOString();
  const sevenDaysAgoIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const totalCards = countRows(db.select({ value: count() }).from(cards));
  const totalDueCards = countRows(
    db.select({ value: count() }).from(cards).where(lte(cards.due, nowIso)),
  );
  const newCardsToday = countRows(
    db
      .select({ value: count() })
      .from(cards)
      .where(
        and(gte(cards.createdAt, todayStartIso), lt(cards.createdAt, tomorrowStartIso)),
      ),
  );
  const reviewsToday = countRows(
    db
      .select({ value: count() })
      .from(activityLog)
      .where(
        and(
          eq(activityLog.kind, "card_review"),
          gte(activityLog.createdAt, todayStartIso),
          lt(activityLog.createdAt, tomorrowStartIso),
        ),
      ),
  );
  const lessonsCompletedToday = countRows(
    db
      .select({ value: count() })
      .from(lessons)
      .where(
        and(
          isNotNull(lessons.completedAt),
          gte(lessons.completedAt, todayStartIso),
          lt(lessons.completedAt, tomorrowStartIso),
        ),
      ),
  );

  const recentActivity = db
    .select({
      createdAt: activityLog.createdAt,
      durationS: activityLog.durationS,
    })
    .from(activityLog)
    .where(and(gte(activityLog.createdAt, heatmapStartIso), lt(activityLog.createdAt, tomorrowStartIso)))
    .all();
  const activeDates = new Set(
    recentActivity.map(({ createdAt }) => createdAt.slice(0, 10)),
  );
  const activeDatesThisWeek = [...activeDates].filter(
    (date) =>
      date >= weekStartIso.slice(0, 10) && date < weekEndIso.slice(0, 10),
  );
  const today = todayStartIso.slice(0, 10);
  const weeklyDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setUTCDate(date.getUTCDate() + index);
    const dateKey = date.toISOString().slice(0, 10);
    return {
      date: dateKey,
      label: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"][index],
      active: activeDates.has(dateKey),
      isToday: dateKey === today,
    };
  });

  const dailyActivity = new Map<string, { count: number; durationS: number }>();
  for (const { createdAt, durationS } of recentActivity) {
    const date = createdAt.slice(0, 10);
    const day = dailyActivity.get(date) ?? { count: 0, durationS: 0 };
    day.count += 1;
    day.durationS += Math.max(0, durationS ?? 0);
    dailyActivity.set(date, day);
  }

  const heatmap84d = Array.from({ length: 84 }, (_, index): HeatmapDay => {
    const date = new Date(heatmapStart);
    date.setUTCDate(date.getUTCDate() + index);
    const dateKey = date.toISOString().slice(0, 10);
    const activity = dailyActivity.get(dateKey) ?? { count: 0, durationS: 0 };
    const level: HeatmapDay["level"] =
      activity.count === 0 ? 0 : activity.count === 1 ? 1 : activity.count < 4 ? 2 : 3;
    return {
      date: dateKey,
      count: activity.count,
      minutes: Math.round(activity.durationS / 60),
      level,
    };
  });

  const deckRows = db.select({ fsrsStateJson: cards.fsrsStateJson }).from(cards).all();
  const deckBreakdown: DeckBreakdown = {
    total: deckRows.length,
    fresh: 0,
    learning: 0,
    mastered: 0,
  };
  for (const { fsrsStateJson } of deckRows) {
    const state = readFSRSState(fsrsStateJson);
    if (!state || state.reps === 0) {
      deckBreakdown.fresh += 1;
    } else if (state.reps >= 1 && state.stability < 14) {
      deckBreakdown.learning += 1;
    } else if (state.reps >= 1 && state.stability >= 14) {
      deckBreakdown.mastered += 1;
    } else {
      deckBreakdown.fresh += 1;
    }
  }

  const scoreRows = db
    .select({ score: activityLog.score })
    .from(activityLog)
    .where(
      and(
        inArray(activityLog.kind, ["drill", "mistake_quiz"]),
        isNotNull(activityLog.score),
      ),
    )
    .orderBy(desc(activityLog.createdAt), desc(activityLog.id))
    .limit(20)
    .all();
  const recentScores = scoreRows
    .map(({ score }) => score)
    .filter((score): score is number => score !== null && Number.isFinite(score));
  const currentScores = recentScores.slice(0, 10);
  const previousScores = recentScores.slice(10, 20);
  const currentAvg =
    currentScores.length > 0
      ? roundToOneDecimal(
          currentScores.reduce((total, score) => total + score, 0) /
            currentScores.length,
        )
      : null;
  const previousAvg =
    previousScores.length > 0
      ? roundToOneDecimal(
          previousScores.reduce((total, score) => total + score, 0) /
            previousScores.length,
        )
      : null;
  const recentAverageScore: RecentAverageScore = {
    currentAvg,
    delta:
      currentAvg !== null && previousAvg !== null
        ? roundToOneDecimal(currentAvg - previousAvg)
        : null,
    sampleCount: currentScores.length,
  };

  const weeklyActivityForStudy = db
    .select({ durationS: activityLog.durationS })
    .from(activityLog)
    .where(
      and(
        gte(activityLog.createdAt, sevenDaysAgoIso),
        lt(activityLog.createdAt, nowIso),
      ),
    )
    .all();
  const weeklyStudyMinutes = Math.round(
    weeklyActivityForStudy.reduce(
      (total, activity) => total + Math.max(0, activity.durationS ?? 0),
      0,
    ) / 60,
  );

  return {
    totalCards,
    totalDueCards,
    reviewableCards: Math.min(totalDueCards, appSettings.dailyReviewCap),
    newCardsToday,
    reviewsToday,
    lessonsCompletedToday,
    activeDaysThisWeek: activeDatesThisWeek.length,
    weeklyDays,
    heatmap84d,
    activeDays84d: heatmap84d.filter((day) => day.count > 0).length,
    deckBreakdown,
    recentAverageScore,
    weeklyStudyMinutes,
  };
}
