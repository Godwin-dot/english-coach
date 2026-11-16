import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activityLog, mistakes } from "@/db/schema";
import { LLMProviderError } from "@/llm/errors";
import { buildMistakeQuizPrompts } from "@/llm/prompts/mistakes";
import { getLLMProvider, type LLMProvider } from "@/llm/provider";
import { getAppSettings } from "@/domain/settings";
import { GeneratedMistakeQuizSchema } from "@/schemas/mistakes";

export type MistakeExample = {
  id: number;
  user_text: string;
  correction: string;
  explanation: string | null;
};

export type MistakePattern = {
  category: string;
  count: number;
  examples: MistakeExample[];
};

export class NoRelevantMistakesError extends Error {
  constructor() {
    super("Aucune erreur enregistrée ne correspond à ce quiz.");
    this.name = "NoRelevantMistakesError";
  }
}

function normalizeCategory(category: string | null | undefined): string {
  const cleaned = category?.trim().replace(/\s+/gu, " ");
  return cleaned || "Général";
}

function categoryKey(category: string | null | undefined): string {
  return normalizeCategory(category).toLocaleLowerCase("fr");
}

export function getTopMistakePatterns(limit = 3): MistakePattern[] {
  const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), 10);
  const rows = db
    .select({
      id: mistakes.id,
      userText: mistakes.userText,
      correction: mistakes.correction,
      explanation: mistakes.explanation,
      category: mistakes.category,
    })
    .from(mistakes)
    .orderBy(desc(mistakes.createdAt), desc(mistakes.id))
    .all();
  const groups = new Map<string, MistakePattern>();

  for (const row of rows) {
    const category = normalizeCategory(row.category);
    const key = categoryKey(category);
    const pattern = groups.get(key);
    const example: MistakeExample = {
      id: row.id,
      user_text: row.userText,
      correction: row.correction,
      explanation: row.explanation,
    };
    if (pattern) {
      pattern.count += 1;
      if (pattern.examples.length < 2) pattern.examples.push(example);
    } else {
      groups.set(key, { category, count: 1, examples: [example] });
    }
  }

  return [...groups.values()]
    .sort((left, right) => right.count - left.count)
    .slice(0, boundedLimit);
}

export async function generateTargetedMistakeQuiz(
  category?: string,
  provider?: LLMProvider,
) {
  const normalizedCategory = category?.trim()
    ? normalizeCategory(category)
    : undefined;
  const selectedKey = normalizedCategory
    ? categoryKey(normalizedCategory)
    : null;
  const relevantMistakes = db
    .select({
      userText: mistakes.userText,
      correction: mistakes.correction,
      explanation: mistakes.explanation,
      category: mistakes.category,
    })
    .from(mistakes)
    .orderBy(desc(mistakes.createdAt), desc(mistakes.id))
    .all()
    .filter(
      (mistake) =>
        selectedKey === null || categoryKey(mistake.category) === selectedKey,
    )
    .slice(0, 8);

  if (relevantMistakes.length === 0) {
    throw new NoRelevantMistakesError();
  }

  const settings = getAppSettings();
  const prompts = buildMistakeQuizPrompts({
    cefrLevel: settings.targetLevel,
    category: normalizedCategory,
    mistakeExamples: relevantMistakes.map((mistake) => ({
      user_text: mistake.userText,
      correction: mistake.correction,
      explanation: mistake.explanation,
    })),
  });

  let quiz: ReturnType<typeof GeneratedMistakeQuizSchema.parse>;
  try {
    quiz = await (provider ?? getLLMProvider()).generateStructuredJSON(
      prompts.systemPrompt,
      prompts.userPrompt,
      GeneratedMistakeQuizSchema,
    );
  } catch (error) {
    if (error instanceof LLMProviderError) throw error;
    throw new LLMProviderError("Le mini-quiz n’a pas pu être généré.", {
      cause: error,
    });
  }

  return normalizedCategory ? { ...quiz, category: normalizedCategory } : quiz;
}

export function recordMistakeQuizCompletion({
  category,
  score,
  duration_s,
}: {
  category: string;
  score: number;
  duration_s?: number;
}): void {
  db.insert(activityLog)
    .values({
      kind: "mistake_quiz",
      score,
      durationS: duration_s ?? null,
      metaJson: JSON.stringify({ category }),
      createdAt: new Date().toISOString(),
    })
    .run();
}

export class MistakeNotFoundError extends Error {
  constructor() {
    super("Erreur introuvable.");
    this.name = "MistakeNotFoundError";
  }
}

export function deleteMistake(id: number): void {
  const deleted = db
    .delete(mistakes)
    .where(eq(mistakes.id, id))
    .returning({ id: mistakes.id })
    .get();
  if (!deleted) throw new MistakeNotFoundError();
}
