import {
  and,
  asc,
  count,
  eq,
  gte,
  lt,
  lte,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import { activityLog, cards, lessons, settings } from "@/db/schema";
import type {
  CreateCardInput,
  SubmitReviewInput,
} from "@/schemas/card";
import {
  createInitialFSRSCard,
  previewNextIntervals,
  scheduleCardReview,
  type ReviewIntervals,
} from "@/srs";

type CardRow = typeof cards.$inferSelect;

export type CardView = Omit<CardRow, "fsrsStateJson">;

export type ReviewCardView = CardView & {
  intervals: ReviewIntervals;
};

export type AddCardResult =
  | { status: "created"; card: CardView }
  | { status: "already_exists"; card: CardView }
  | { status: "daily_cap_reached"; limit: number };

export class CardNotFoundError extends Error {
  constructor() {
    super("Carte introuvable.");
    this.name = "CardNotFoundError";
  }
}

export class SourceLessonNotFoundError extends Error {
  constructor() {
    super("Leçon source introuvable.");
    this.name = "SourceLessonNotFoundError";
  }
}

function toCardView(row: CardRow): CardView {
  const { fsrsStateJson: _, ...view } = row;
  return view;
}

function readIntegerSetting(
  key: string,
  fallback: number,
  minimum: number,
): number {
  const row = db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).get();
  if (!row) {
    return fallback;
  }

  const value: unknown = JSON.parse(row.value);
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum
  ) {
    throw new Error(`The ${key} setting must be an integer >= ${minimum}.`);
  }
  return value;
}

function getMatchingCard(
  term: string,
  query: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
): CardRow | undefined {
  const normalizedTerm = term.toLowerCase();
  return query
    .select()
    .from(cards)
    .where(
      and(
        eq(cards.language, "en"),
        sql`lower(${cards.term}) = ${normalizedTerm}`,
      ),
    )
    .get();
}

export function addCardFromLesson(input: CreateCardInput): AddCardResult {
  const now = new Date();
  const createdAt = now.toISOString();
  const dayStart = `${createdAt.slice(0, 10)}T00:00:00.000Z`;
  const nextDay = new Date(`${createdAt.slice(0, 10)}T00:00:00.000Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);

  return db.transaction((transaction) => {
    const existing = getMatchingCard(input.term, transaction);
    if (existing) {
      return { status: "already_exists", card: toCardView(existing) };
    }
    const dailyLimit = readIntegerSetting("daily_new_cards", 10, 0);

    if (input.source_lesson_id !== undefined && input.source_lesson_id !== null) {
      const sourceLesson = transaction
        .select({ id: lessons.id })
        .from(lessons)
        .where(eq(lessons.id, input.source_lesson_id))
        .get();
      if (!sourceLesson) {
        throw new SourceLessonNotFoundError();
      }
    }

    const cardsCreatedToday =
      transaction
        .select({ value: count() })
        .from(cards)
        .where(
          and(
            gte(cards.createdAt, dayStart),
            lt(cards.createdAt, nextDay.toISOString()),
          ),
        )
        .get()?.value ?? 0;
    if (cardsCreatedToday >= dailyLimit) {
      return { status: "daily_cap_reached", limit: dailyLimit };
    }

    const initialState = createInitialFSRSCard(now);
    const inserted = transaction
      .insert(cards)
      .values({
        language: "en",
        term: input.term,
        translation: input.translation,
        phonetic: input.phonetic ?? null,
        exampleSentence: input.example_sentence,
        exampleTranslation: input.example_translation,
        mnemonic: input.mnemonic ?? null,
        sourceLessonId: input.source_lesson_id ?? null,
        due: initialState.due,
        fsrsStateJson: initialState.fsrsStateJson,
        createdAt,
      })
      .onConflictDoNothing()
      .returning()
      .get();

    if (inserted) {
      return { status: "created", card: toCardView(inserted) };
    }

    const racedCard = getMatchingCard(input.term, transaction);
    if (racedCard) {
      return { status: "already_exists", card: toCardView(racedCard) };
    }
    throw new Error("La carte n’a pas pu être enregistrée.");
  });
}

export function getDueCards(now = new Date()): {
  cards: ReviewCardView[];
  totalDueCount: number;
} {
  const reviewLimit = readIntegerSetting("daily_review_cap", 15, 0);
  const dueWhere = lte(cards.due, now.toISOString());
  const totalDueCount =
    db.select({ value: count() }).from(cards).where(dueWhere).get()?.value ?? 0;
  const dueRows = db
    .select()
    .from(cards)
    .where(dueWhere)
    .orderBy(asc(cards.due), asc(cards.id))
    .limit(reviewLimit)
    .all();

  return {
    cards: dueRows.map((row) => ({
      ...toCardView(row),
      intervals: previewNextIntervals(row.fsrsStateJson, now),
    })),
    totalDueCount,
  };
}

export function getReviewableCardCount(now = new Date()): number {
  const reviewLimit = readIntegerSetting("daily_review_cap", 15, 0);
  const totalDueCount =
    db
      .select({ value: count() })
      .from(cards)
      .where(lte(cards.due, now.toISOString()))
      .get()?.value ?? 0;
  return Math.min(totalDueCount, reviewLimit);
}

export function submitCardReview(
  cardId: number,
  rating: SubmitReviewInput["rating"],
  durationS?: number,
): ReviewCardView {
  const now = new Date();
  const reviewedAt = now.toISOString();

  return db.transaction((transaction) => {
    const currentCard = transaction
      .select()
      .from(cards)
      .where(eq(cards.id, cardId))
      .get();
    if (!currentCard) {
      throw new CardNotFoundError();
    }

    const nextState = scheduleCardReview(
      currentCard.fsrsStateJson,
      rating,
      now,
    );
    const updatedCard = transaction
      .update(cards)
      .set({
        due: nextState.due,
        fsrsStateJson: nextState.fsrsStateJson,
      })
      .where(eq(cards.id, cardId))
      .returning()
      .get();
    if (!updatedCard) {
      throw new CardNotFoundError();
    }

    transaction
      .insert(activityLog)
      .values({
        kind: "card_review",
        refId: cardId,
        rating,
        durationS: durationS ?? null,
        createdAt: reviewedAt,
      })
      .run();

    return {
      ...toCardView(updatedCard),
      intervals: previewNextIntervals(updatedCard.fsrsStateJson, now),
    };
  });
}
