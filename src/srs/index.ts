import { z } from "zod";
import {
  createEmptyCard,
  fsrs,
  Rating,
  type Card as FSRSCard,
} from "ts-fsrs";

const stateValues = [0, 1, 2, 3] as const;
const SerializedCardSchema = z.object({
  due: z.string().datetime({ offset: true }),
  stability: z.number(),
  difficulty: z.number(),
  scheduled_days: z.number(),
  learning_steps: z.number(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  state: z.number().int().refine((value) => stateValues.includes(value as (typeof stateValues)[number])),
  last_review: z.string().datetime({ offset: true }).nullable().optional(),
});

export type ReviewRating = 1 | 2 | 3 | 4;
export type ReviewIntervals = Record<ReviewRating, string>;

type FSRSRating =
  | typeof Rating.Again
  | typeof Rating.Hard
  | typeof Rating.Good
  | typeof Rating.Easy;

const ratingByValue: Record<ReviewRating, FSRSRating> = {
  1: Rating.Again,
  2: Rating.Hard,
  3: Rating.Good,
  4: Rating.Easy,
};

function deserializeCard(fsrsStateJson: string): FSRSCard {
  let value: unknown;
  try {
    value = JSON.parse(fsrsStateJson) as unknown;
  } catch {
    throw new Error("L’état FSRS de la carte n’est pas un JSON valide.");
  }

  const parsed = SerializedCardSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("L’état FSRS de la carte est invalide.");
  }

  const { last_review: lastReview, ...cardState } = parsed.data;
  return {
    ...cardState,
    due: new Date(parsed.data.due),
    state: parsed.data.state as FSRSCard["state"],
    ...(lastReview
      ? { last_review: new Date(lastReview) }
      : {}),
  };
}

function serializeCard(card: FSRSCard): string {
  return JSON.stringify(card);
}

export function createInitialFSRSCard(
  now = new Date(),
): { due: string; fsrsStateJson: string } {
  const card = createEmptyCard(now);
  return {
    due: now.toISOString(),
    fsrsStateJson: serializeCard(card),
  };
}

export function scheduleCardReview(
  fsrsStateJson: string,
  rating: ReviewRating,
  now = new Date(),
): { due: string; fsrsStateJson: string } {
  const card = deserializeCard(fsrsStateJson);
  const scheduled = fsrs().repeat(card, now)[ratingByValue[rating]];
  return {
    due: scheduled.card.due.toISOString(),
    fsrsStateJson: serializeCard(scheduled.card),
  };
}

function formatInterval(due: Date, now: Date): string {
  const durationMs = Math.max(0, due.getTime() - now.getTime());
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (durationMs < minute) return "< 1 min";
  if (durationMs < hour) return `${Math.round(durationMs / minute)} min`;
  if (durationMs < day) return `${Math.round(durationMs / hour)} h`;
  if (durationMs < 7 * day) return `${Math.round(durationMs / day)} j`;
  if (durationMs < 30 * day) return `${Math.round(durationMs / (7 * day))} sem`;
  if (durationMs < 365 * day) return `${Math.round(durationMs / (30 * day))} mois`;
  return `${Math.round(durationMs / (365 * day))} an`;
}

export function previewNextIntervals(
  fsrsStateJson: string,
  now = new Date(),
): ReviewIntervals {
  const card = deserializeCard(fsrsStateJson);
  const previews = fsrs().repeat(card, now);
  return {
    1: formatInterval(previews[Rating.Again].card.due, now),
    2: formatInterval(previews[Rating.Hard].card.due, now),
    3: formatInterval(previews[Rating.Good].card.due, now),
    4: formatInterval(previews[Rating.Easy].card.due, now),
  };
}
