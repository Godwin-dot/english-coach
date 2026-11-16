import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { ZodError } from "zod";
import { db } from "@/db";
import { activityLog, cards, mistakes } from "@/db/schema";
import { addMissedVocabCards } from "@/domain/cards";
import { LLMProviderError } from "@/llm/errors";
import { getLLMProvider } from "@/llm/provider";
import {
  ChatTurnLLMResponseSchema,
  type ChatCloseSessionInput,
  type ChatTurnLLMResponse,
  type ChatTurnInput,
} from "@/schemas/chat";
import { buildChatTurnPrompts } from "@/llm/prompts/chat";

function getRecentTargetWords(): string[] {
  return db
    .select({ term: cards.term })
    .from(cards)
    .orderBy(desc(cards.createdAt), desc(cards.id))
    .limit(5)
    .all()
    .map(({ term }) => term);
}

function chatSessionAlreadyLogged(
  query: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
  sessionId: string,
): boolean {
  const sessionMarker = `"sessionId":"${sessionId}"`;
  return Boolean(
    query
      .select({ id: activityLog.id })
      .from(activityLog)
      .where(
        and(
          eq(activityLog.kind, "chat"),
          isNotNull(activityLog.metaJson),
          sql`instr(${activityLog.metaJson}, ${sessionMarker}) > 0`,
        ),
      )
      .get(),
  );
}

export async function processChatTurn(input: ChatTurnInput) {
  const lastUserMessage = input.messages.at(-1);
  if (!lastUserMessage || lastUserMessage.role !== "user") {
    throw new Error("Le dernier message doit provenir de l’utilisateur.");
  }

  const prompts = buildChatTurnPrompts({
    scenario: input.scenario,
    cefrLevel: input.cefrLevel,
    messages: input.messages,
    targetWords: getRecentTargetWords(),
  });
  const provider = getLLMProvider();
  let result: ChatTurnLLMResponse;
  try {
    result = await provider.generateStructuredJSON(
      prompts.systemPrompt,
      prompts.userPrompt,
      ChatTurnLLMResponseSchema,
    );
  } catch (error) {
    if (
      !(error instanceof LLMProviderError) ||
      ![
        "Le fournisseur a renvoyé un JSON invalide.",
        "La réponse du fournisseur ne respecte pas le format attendu.",
      ].includes(error.message)
    ) {
      throw error;
    }

    const validationDetails =
      error.cause instanceof ZodError
        ? error.cause.issues
            .map(({ path, message }) => `${path.join(".")}: ${message}`)
            .join("; ")
        : "Return one valid JSON object with every required field.";
    result = await provider.generateStructuredJSON(
      `${prompts.systemPrompt} Your previous output was invalid. Correct these issues and return only the complete required JSON object: ${validationDetails}`,
      prompts.userPrompt,
      ChatTurnLLMResponseSchema,
    );
  }
  const now = new Date().toISOString();
  const userExchangeCount = input.messages.filter(
    ({ role }) => role === "user",
  ).length;

  db.transaction((transaction) => {
    if (result.detected_mistakes.length > 0) {
      transaction
        .insert(mistakes)
        .values(
          result.detected_mistakes.map((mistake) => ({
            source: "chat" as const,
            userText: mistake.user_fragment,
            correction: mistake.correction,
            category: mistake.category,
            explanation: mistake.explanation,
            createdAt: now,
          })),
        )
        .run();
    }

    if (userExchangeCount >= 3 && !input.sessionId) {
      transaction
        .insert(activityLog)
        .values({
          kind: "chat",
          score: result.score,
          durationS: input.duration_s ?? null,
          metaJson: JSON.stringify({
            scenario: input.scenario,
            userMessage: lastUserMessage.content,
            exchanges: userExchangeCount,
          }),
          createdAt: now,
        })
        .run();
    } else if (
      userExchangeCount >= 3 &&
      input.sessionId &&
      !chatSessionAlreadyLogged(transaction, input.sessionId)
    ) {
      transaction
        .insert(activityLog)
        .values({
          kind: "chat",
          score: result.score,
          durationS: input.duration_s ?? null,
          metaJson: JSON.stringify({
            sessionId: input.sessionId,
            scenario: input.scenario,
            userMessage: lastUserMessage.content,
            exchanges: userExchangeCount,
            closed: false,
          }),
          createdAt: now,
        })
        .run();
    }
  });

  const addedWords =
    result.score < 7 || result.detected_mistakes.length > 0
      ? addMissedVocabCards(result.missed_vocab)
      : [];

  return { ...result, addedWords };
}

export function closeChatSession(input: ChatCloseSessionInput): void {
  db.transaction((transaction) => {
    if (chatSessionAlreadyLogged(transaction, input.sessionId)) {
      return;
    }
    transaction
      .insert(activityLog)
      .values({
        kind: "chat",
        score: input.score,
        durationS: input.duration_s,
        metaJson: JSON.stringify({
          sessionId: input.sessionId,
          scenario: input.scenario,
          userMessage: input.lastUserMessage ?? "",
          exchanges: input.exchanges,
          closed: true,
        }),
        createdAt: new Date().toISOString(),
      })
      .run();
  });
}
