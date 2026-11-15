import { and, count, eq, gte, isNotNull, lt, lte } from "drizzle-orm";
import { db } from "@/db";
import { activityLog, cards, lessons } from "@/db/schema";
import type { AppSettings } from "@/schemas/settings";

export type DashboardDay = {
  date: string;
  label: string;
  active: boolean;
  isToday: boolean;
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
};

function countRows(query: { get: () => { value: number } | undefined }): number {
  return query.get()?.value ?? 0;
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

  const weeklyActivity = db
    .select({ createdAt: activityLog.createdAt })
    .from(activityLog)
    .where(
      and(gte(activityLog.createdAt, weekStartIso), lt(activityLog.createdAt, weekEndIso)),
    )
    .all();
  const activeDates = new Set(
    weeklyActivity.map(({ createdAt }) => createdAt.slice(0, 10)),
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

  return {
    totalCards,
    totalDueCards,
    reviewableCards: Math.min(totalDueCards, appSettings.dailyReviewCap),
    newCardsToday,
    reviewsToday,
    lessonsCompletedToday,
    activeDaysThisWeek: activeDates.size,
    weeklyDays,
  };
}
