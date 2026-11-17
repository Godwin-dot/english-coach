import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { ZodError } from "zod";
import { db } from "@/db";
import {
  activityLog,
  cards,
  chatMessages,
  chatSessions,
  mistakes,
} from "@/db/schema";
import { addMissedVocabCards } from "@/domain/cards";
import { LLMProviderError } from "@/llm/errors";
import { getLLMProvider, type LLMProvider } from "@/llm/provider";
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

export async function processChatTurn(
  input: ChatTurnInput,
  providerOverride?: LLMProvider,
) {
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
  const provider = providerOverride ?? getLLMProvider();
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
  const coaching = {
    natural_version: result.natural_version,
    score: result.score,
    feedback_fr: result.feedback_fr,
    detected_mistakes: result.detected_mistakes,
    addedWords:
      result.score < 7 || result.detected_mistakes.length > 0
        ? addMissedVocabCards(result.missed_vocab)
        : [],
  };

  db.transaction((transaction) => {
    if (input.sessionId) {
      const existingSession = transaction
        .select({ id: chatSessions.id })
        .from(chatSessions)
        .where(eq(chatSessions.id, input.sessionId))
        .get();

      if (!existingSession) {
        const firstUserMessage = input.messages.find(
          ({ role }) => role === "user",
        );
        transaction
          .insert(chatSessions)
          .values({
            id: input.sessionId,
            scenario: input.scenario,
            cefrLevel: input.cefrLevel,
            title: (firstUserMessage?.content ?? input.scenario).slice(0, 120),
            createdAt: now,
            updatedAt: now,
          })
          .run();

        for (const message of input.messages.slice(0, -1)) {
          transaction
            .insert(chatMessages)
            .values({
              sessionId: input.sessionId,
              role: message.role,
              content: message.content,
              correctionJson: null,
              createdAt: now,
            })
            .run();
        }
      }

      transaction
        .insert(chatMessages)
        .values({
          sessionId: input.sessionId,
          role: "user",
          content: lastUserMessage.content,
          correctionJson: JSON.stringify({ coaching }),
          createdAt: now,
        })
        .run();
      transaction
        .insert(chatMessages)
        .values({
          sessionId: input.sessionId,
          role: "assistant",
          content: result.assistant_reply,
          correctionJson: JSON.stringify({
            translation: result.reply_translation_fr,
          }),
          createdAt: now,
        })
        .run();
      transaction
        .update(chatSessions)
        .set({
          scenario: input.scenario,
          cefrLevel: input.cefrLevel,
          updatedAt: now,
        })
        .where(eq(chatSessions.id, input.sessionId))
        .run();
    }

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

  return { ...result, addedWords: coaching.addedWords };
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

export function listChatSessions(limit = 30) {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  return db
    .select({
      id: chatSessions.id,
      scenario: chatSessions.scenario,
      cefr_level: chatSessions.cefrLevel,
      preview: chatSessions.title,
      message_count: sql<number>`count(${chatMessages.id})`.as("message_count"),
      updated_at: chatSessions.updatedAt,
    })
    .from(chatSessions)
    .leftJoin(chatMessages, eq(chatMessages.sessionId, chatSessions.id))
    .groupBy(chatSessions.id)
    .orderBy(desc(chatSessions.updatedAt))
    .limit(safeLimit)
    .all();
}

export function getChatSessionById(sessionId: string) {
  const session = db
    .select({
      id: chatSessions.id,
      scenario: chatSessions.scenario,
      cefr_level: chatSessions.cefrLevel,
      title: chatSessions.title,
      created_at: chatSessions.createdAt,
      updated_at: chatSessions.updatedAt,
    })
    .from(chatSessions)
    .where(eq(chatSessions.id, sessionId))
    .get();
  if (!session) return null;

  const messages = db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
      correction_json: chatMessages.correctionJson,
      created_at: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id))
    .all();
  return { session, messages };
}

export function deleteChatSession(sessionId: string): boolean {
  const result = db
    .delete(chatSessions)
    .where(eq(chatSessions.id, sessionId))
    .run();
  return result.changes > 0;
}
