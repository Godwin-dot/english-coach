import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const lessons = sqliteTable("lessons", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  language: text("language").notNull().default("en"),
  topic: text("topic").notNull(),
  cefrLevel: text("cefr_level").notNull(),
  contentEn: text("content_en").notNull(),
  contentFr: text("content_fr").notNull(),
  keywordsJson: text("keywords_json").notNull(),
  quizJson: text("quiz_json").notNull(),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
});

export const cards = sqliteTable(
  "cards",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    language: text("language").notNull().default("en"),
    term: text("term").notNull(),
    translation: text("translation").notNull(),
    phonetic: text("phonetic"),
    exampleSentence: text("example_sentence").notNull(),
    exampleTranslation: text("example_translation").notNull(),
    mnemonic: text("mnemonic"),
    sourceLessonId: integer("source_lesson_id").references(() => lessons.id, {
      onDelete: "set null",
    }),
    due: text("due").notNull(),
    fsrsStateJson: text("fsrs_state_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    unique("cards_language_term_unique").on(table.language, table.term),
    uniqueIndex("idx_cards_language_lower_term").on(
      table.language,
      sql`lower(${table.term})`,
    ),
    index("idx_cards_due").on(table.due),
  ],
);

export const activityLog = sqliteTable(
  "activity_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind").notNull(),
    refId: integer("ref_id"),
    rating: integer("rating"),
    score: real("score"),
    durationS: integer("duration_s"),
    metaJson: text("meta_json"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_activity_date").on(table.createdAt)],
);
