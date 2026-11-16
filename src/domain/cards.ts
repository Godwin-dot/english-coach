import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  count,
  eq,
  gte,
  lt,
  lte,
  notInArray,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import { activityLog, cards, lessons, settings } from "@/db/schema";
import type {
  CreateCardInput,
  SubmitReviewInput,
} from "@/schemas/card";
import {
  DiscoveredVocabBatchSchema,
  type DiscoveredVocabItem,
} from "@/schemas/card";
import { getAppSettings } from "@/domain/settings";
import { LLMProviderError } from "@/llm/errors";
import { getLLMProvider } from "@/llm/provider";
import { buildDiscoverVocabPrompts } from "@/llm/prompts/vocab";
import {
  createInitialFSRSCard,
  previewNextIntervals,
  scheduleCardReview,
  type ReviewIntervals,
  type ReviewRating,
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

export type MissedVocabItem = {
  term: string;
  translation: string;
  context_sentence: string;
  note_fr: string;
};

export type DiscoveryCard = DiscoveredVocabItem & {
  discoveryId: string;
  isDiscovery: true;
  intervals: ReviewIntervals;
};

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

export class InvalidDiscoveredVocabError extends Error {
  constructor() {
    super("Un mot de découverte doit contenir au maximum deux mots.");
    this.name = "InvalidDiscoveredVocabError";
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

export function addMissedVocabCards(items: MissedVocabItem[]): string[] {
  const now = new Date();
  const createdAt = now.toISOString();

  return db.transaction((transaction) => {
    const addedWords: string[] = [];
    const seenTerms = new Set<string>();

    for (const item of items.slice(0, 3)) {
      const term = item.term.trim();
      const normalizedTerm = term.toLocaleLowerCase("en");
      const wordCount = term.split(/\s+/u).filter(Boolean).length;
      if (
        !term ||
        wordCount > 2 ||
        /[.!?]$/u.test(term) ||
        seenTerms.has(normalizedTerm)
      ) {
        continue;
      }
      seenTerms.add(normalizedTerm);

      if (getMatchingCard(term, transaction)) {
        continue;
      }

      const initialState = createInitialFSRSCard(now);
      const inserted = transaction
        .insert(cards)
        .values({
          language: "en",
          term,
          translation: item.translation.trim(),
          exampleSentence: item.context_sentence.trim(),
          exampleTranslation: item.translation.trim(),
          mnemonic: item.note_fr.trim() || null,
          sourceLessonId: null,
          due: initialState.due,
          fsrsStateJson: initialState.fsrsStateJson,
          createdAt,
        })
        .onConflictDoNothing()
        .returning({ id: cards.id })
        .get();

      if (inserted) {
        addedWords.push(term);
      }
    }

    return addedWords;
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

export type RemainingDueBatch = {
  cards: ReviewCardView[];
  remainingDueCount: number;
};

export function getRemainingDueCards(
  excludeIds: number[],
  now = new Date(),
  limit = 10,
): RemainingDueBatch {
  const nowIso = now.toISOString();
  const uniqueExcluded = [...new Set(excludeIds)];
  const notExcluded =
    uniqueExcluded.length > 0 ? notInArray(cards.id, uniqueExcluded) : undefined;
  const dueWhere = and(
    lte(cards.due, nowIso),
    ...(notExcluded ? [notExcluded] : []),
  );
  const remainingDueCount =
    db.select({ value: count() }).from(cards).where(dueWhere).get()?.value ?? 0;
  const stability = sql<number>`coalesce(json_extract(${cards.fsrsStateJson}, '$.stability'), 0)`;
  const dueRows = db
    .select()
    .from(cards)
    .where(dueWhere)
    .orderBy(asc(cards.due), asc(stability), asc(cards.id))
    .limit(limit)
    .all();

  return {
    cards: dueRows.map((row) => ({
      ...toCardView(row),
      intervals: previewNextIntervals(row.fsrsStateJson, now),
    })),
    remainingDueCount,
  };
}

export async function generateNewVocabBatch(
  count = 6,
  sessionExcludedTerms: string[] = [],
): Promise<DiscoveryCard[]> {
  const requestedCount = Math.min(Math.max(Math.floor(count), 4), 8);
  const appSettings = getAppSettings();
  const allExistingTerms = db
    .select({ term: cards.term })
    .from(cards)
    .orderBy(asc(cards.createdAt), asc(cards.id))
    .all()
    .map(({ term }) => term);
  const promptExcludedTerms = allExistingTerms.slice(-150);
  const blockedTerms = new Set(
    [...allExistingTerms, ...sessionExcludedTerms].map((term) =>
      term.trim().toLocaleLowerCase("en"),
    ),
  );
  const provider = getLLMProvider();
  let promptExcluded = [
    ...new Set(
      [...promptExcludedTerms, ...sessionExcludedTerms].map((term) =>
        term.trim(),
      ),
    ),
  ];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const prompts = buildDiscoverVocabPrompts({
      count: requestedCount,
      cefrLevel: appSettings.targetLevel,
      interests: appSettings.interests,
      excludedTerms: promptExcluded,
    });
    const generated = await provider.generateStructuredJSON(
      prompts.systemPrompt,
      prompts.userPrompt,
      DiscoveredVocabBatchSchema,
    );
    const seenTerms = new Set(blockedTerms);
    const uniqueWords = generated.words.filter(({ term }) => {
      const normalizedTerm = term.toLocaleLowerCase("en");
      if (
        term.split(/\s+/u).length > 2 ||
        /[.!?]$/u.test(term) ||
        seenTerms.has(normalizedTerm)
      ) {
        return false;
      }
      seenTerms.add(normalizedTerm);
      return true;
    });

    if (uniqueWords.length >= 4) {
      return uniqueWords.slice(0, requestedCount).map((word) => {
        const initialState = createInitialFSRSCard();
        return {
          ...word,
          discoveryId: randomUUID(),
          isDiscovery: true,
          intervals: previewNextIntervals(initialState.fsrsStateJson),
        };
      });
    }

    promptExcluded = [
      ...new Set([
        ...promptExcluded,
        ...generated.words.map(({ term }) => term),
      ]),
    ];
  }

  throw new LLMProviderError(
    "Impossible de trouver assez de nouveaux mots non présents dans votre deck. Réessayez.",
  );
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
  mode: "due" | "continuous" = "due",
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

    const isContinuousPractice =
      mode === "continuous" && currentCard.due > reviewedAt;
    if (isContinuousPractice) {
      transaction
        .insert(activityLog)
        .values({
          kind: "card_practice",
          refId: cardId,
          rating,
          durationS: durationS ?? null,
          createdAt: reviewedAt,
        })
        .run();

      return {
        ...toCardView(currentCard),
        intervals: previewNextIntervals(currentCard.fsrsStateJson, now),
      };
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

export function saveAndGradeDiscoveredCard({
  rating,
  durationS,
  ...word
}: DiscoveredVocabItem & {
  rating: ReviewRating;
  durationS?: number;
}): { status: "created" | "already_exists"; card: ReviewCardView } {
  const term = word.term.trim();
  if (term.split(/\s+/u).length > 2 || /[.!?]$/u.test(term)) {
    throw new InvalidDiscoveredVocabError();
  }

  const now = new Date();
  const createdAt = now.toISOString();

  return db.transaction((transaction) => {
    const existing = getMatchingCard(term, transaction);
    if (existing) {
      transaction
        .insert(activityLog)
        .values({
          kind: "card_practice",
          refId: existing.id,
          rating,
          durationS: durationS ?? null,
          createdAt,
        })
        .run();
      return {
        status: "already_exists",
        card: {
          ...toCardView(existing),
          intervals: previewNextIntervals(existing.fsrsStateJson, now),
        },
      };
    }

    const initialState = createInitialFSRSCard(now);
    const scheduled = scheduleCardReview(
      initialState.fsrsStateJson,
      rating,
      now,
    );
    const inserted = transaction
      .insert(cards)
      .values({
        language: "en",
        term,
        translation: word.translation,
        phonetic: null,
        exampleSentence: word.example_sentence,
        exampleTranslation: word.example_translation,
        mnemonic: word.mnemonic || null,
        sourceLessonId: null,
        due: scheduled.due,
        fsrsStateJson: scheduled.fsrsStateJson,
        createdAt,
      })
      .onConflictDoNothing()
      .returning()
      .get();

    if (!inserted) {
      const racedCard = getMatchingCard(term, transaction);
      if (!racedCard) {
        throw new Error("Le nouveau mot n’a pas pu être enregistré.");
      }
      return {
        status: "already_exists",
        card: {
          ...toCardView(racedCard),
          intervals: previewNextIntervals(racedCard.fsrsStateJson, now),
        },
      };
    }

    transaction
      .insert(activityLog)
      .values({
        kind: "card_review",
        refId: inserted.id,
        rating,
        durationS: durationS ?? null,
        createdAt,
      })
      .run();

    return {
      status: "created",
      card: {
        ...toCardView(inserted),
        intervals: previewNextIntervals(inserted.fsrsStateJson, now),
      },
    };
  });
}
