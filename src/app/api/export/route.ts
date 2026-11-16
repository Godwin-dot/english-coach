import { desc, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { activityLog, cards, lessons, mistakes, settings } from "@/db/schema";

export const dynamic = "force-dynamic";

const educationalSettingKeys = [
  "daily_new_cards",
  "daily_review_cap",
  "weekly_goal_days",
  "target_level",
  "interests",
] as const;

export function GET() {
  const settingRows = db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, [...educationalSettingKeys]))
    .all();
  const exportedSettings = Object.fromEntries(
    settingRows.map(({ key, value }) => [key, JSON.parse(value) as unknown]),
  );
  const payload = {
    exportedAt: new Date().toISOString(),
    settings: exportedSettings,
    cards: db.select().from(cards).orderBy(desc(cards.id)).all(),
    lessons: db.select().from(lessons).orderBy(desc(lessons.id)).all(),
    mistakes: db.select().from(mistakes).orderBy(desc(mistakes.id)).all(),
    activity_log: db.select().from(activityLog).orderBy(desc(activityLog.id)).all(),
  };
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="english-coach-backup-${date}.json"`,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
