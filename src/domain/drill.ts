import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
} from "drizzle-orm";
import { db } from "@/db";
import { activityLog, cards, mistakes } from "@/db/schema";
import { getAppSettings } from "@/domain/settings";
import { LLMProviderError } from "@/llm/errors";
import {
  DrillEvaluationResultSchema,
  GeneratedDrillPromptSchema,
  type DrillEvaluationResult,
  type EvaluateDrillInput,
} from "@/schemas/drill";
import { getLLMProvider } from "@/llm/provider";
import {
  buildEvaluateDrillPrompts,
  buildGenerateDrillPrompts,
} from "@/llm/prompts/drill";

export type RecentMistake = Pick<
  typeof mistakes.$inferSelect,
  "id" | "source" | "userText" | "correction" | "category" | "explanation" | "createdAt"
>;

export type MistakeCategoryCount = {
  category: string;
  count: number;
};

export type RecentMistakes = {
  mistakes: RecentMistake[];
  categories: MistakeCategoryCount[];
  totalCount: number;
};

export function getRecentMistakes(limit = 8): RecentMistakes {
  const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), 50);
  const recent = db
    .select()
    .from(mistakes)
    .orderBy(desc(mistakes.createdAt), desc(mistakes.id))
    .limit(boundedLimit)
    .all();
  const categories = db
    .select({
      category: mistakes.category,
      count: count(),
    })
    .from(mistakes)
    .where(isNotNull(mistakes.category))
    .groupBy(mistakes.category)
    .orderBy(desc(count()))
    .limit(5)
    .all()
    .flatMap(({ category, count: total }) =>
      category ? [{ category, count: total }] : [],
    );
  const totalCount =
    db.select({ count: count() }).from(mistakes).get()?.count ?? 0;

  return { mistakes: recent, categories, totalCount };
}

function getTargetWords(): string[] {
  const recentlyReviewed = db
    .select({ cardId: activityLog.refId })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.kind, "card_review"),
        isNotNull(activityLog.refId),
      ),
    )
    .orderBy(desc(activityLog.createdAt), desc(activityLog.id))
    .limit(10)
    .all()
    .flatMap(({ cardId }) => (cardId === null ? [] : [cardId]));
  const reviewedCards =
    recentlyReviewed.length > 0
      ? db.select().from(cards).where(inArray(cards.id, recentlyReviewed)).all()
      : [];
  const reviewedById = new Map(reviewedCards.map((card) => [card.id, card]));
  const prioritized = recentlyReviewed.flatMap((id) => {
    const card = reviewedById.get(id);
    return card ? [card.term] : [];
  });
  const recentCards = db
    .select({ term: cards.term })
    .from(cards)
    .orderBy(desc(cards.createdAt), desc(cards.id))
    .limit(5)
    .all()
    .map(({ term }) => term);

  return [...new Set([...prioritized, ...recentCards])].slice(0, 5);
}

export async function generateDrillExercise() {
  const appSettings = getAppSettings();
  const recentMistakes = getRecentMistakes(5).mistakes;
  const prompts = buildGenerateDrillPrompts({
    cefrLevel: appSettings.targetLevel,
    interests: appSettings.interests,
    targetWords: getTargetWords(),
    recentMistakes: recentMistakes.map(({ category, userText, correction }) => ({
      category,
      userText,
      correction,
    })),
  });
  const provider = getLLMProvider();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const lengthReminder =
      attempt === 0
        ? ""
        : " Rewrite the French sentence to contain between 12 and 25 words, inclusive.";
    const exercise = await provider.generateStructuredJSON(
      `${prompts.systemPrompt}${lengthReminder}`,
      prompts.userPrompt,
      GeneratedDrillPromptSchema,
    );
    const wordCount = exercise.french_sentence.split(/\s+/u).length;
    if (wordCount >= 12 && wordCount <= 25) {
      return { ...exercise, recentMistakes };
    }
  }

  throw new LLMProviderError(
    "La phrase générée doit contenir entre 12 et 25 mots. Réessayez.",
  );
}

export async function evaluateAndSaveDrill(
  input: EvaluateDrillInput,
): Promise<
  DrillEvaluationResult & {
    recentMistakes: RecentMistake[];
    categories: MistakeCategoryCount[];
    totalMistakes: number;
  }
> {
  const prompts = buildEvaluateDrillPrompts(input);
  const result = await getLLMProvider().generateStructuredJSON(
    prompts.systemPrompt,
    prompts.userPrompt,
    DrillEvaluationResultSchema,
  );
  const now = new Date().toISOString();

  db.transaction((transaction) => {
    if (result.detected_mistakes.length > 0) {
      transaction
        .insert(mistakes)
        .values(
          result.detected_mistakes.map((item) => ({
            source: "drill" as const,
            userText: item.user_fragment,
            correction: item.correction,
            category: item.category,
            explanation: item.explanation,
            createdAt: now,
          })),
        )
        .run();
    }

    transaction
      .insert(activityLog)
      .values({
        kind: "drill",
        score: result.score,
        durationS: input.duration_s ?? null,
        metaJson: JSON.stringify({
          frenchSentence: input.frenchSentence,
          userTranslation: input.userTranslation,
        }),
        createdAt: now,
      })
      .run();
  });

  const updatedMistakes = getRecentMistakes(8);
  return {
    ...result,
    recentMistakes: updatedMistakes.mistakes,
    categories: updatedMistakes.categories,
    totalMistakes: updatedMistakes.totalCount,
  };
}
