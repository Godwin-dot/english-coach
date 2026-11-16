import { z } from "zod";
import { MissedVocabItemSchema } from "./card";
import { CEFRLevelSchema } from "./lesson";

export const ChatMessageItemSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(3000),
});

export const ChatTurnInputSchema = z
  .object({
    scenario: z.string().trim().min(2).max(120),
    cefrLevel: CEFRLevelSchema,
    messages: z.array(ChatMessageItemSchema).min(1).max(30),
    duration_s: z.number().int().min(0).optional(),
    sessionId: z.string().uuid().optional(),
  })
  .superRefine((input, context) => {
    if (input.messages.at(-1)?.role !== "user") {
      context.addIssue({
        code: "custom",
        message: "Le dernier message doit provenir de l’utilisateur.",
        path: ["messages"],
      });
    }
  });

export const ChatTurnLLMResponseSchema = z.object({
  assistant_reply: z.string().trim().min(1).max(1200),
  reply_translation_fr: z.string().trim().min(1).max(1500),
  natural_version: z.string().trim().min(1).max(2000),
  score: z.number().min(0).max(10),
  feedback_fr: z.string().trim().min(1).max(500),
  detected_mistakes: z.array(
    z.object({
      user_fragment: z.string().trim().min(1).max(500),
      correction: z.string().trim().min(1).max(500),
      category: z.string().trim().min(1).max(80),
      explanation: z.string().trim().min(1).max(600),
    }),
  ),
  missed_vocab: z.array(MissedVocabItemSchema).max(3),
});

export const ChatCloseSessionInputSchema = z.object({
  sessionId: z.string().uuid(),
  scenario: z.string().trim().min(2).max(120),
  exchanges: z.number().int().min(1).max(30),
  score: z.number().min(0).max(10),
  lastUserMessage: z.string().trim().max(3000).optional(),
  duration_s: z.number().int().min(0),
});

export type ChatMessageItem = z.infer<typeof ChatMessageItemSchema>;
export type ChatTurnInput = z.infer<typeof ChatTurnInputSchema>;
export type ChatTurnLLMResponse = z.infer<typeof ChatTurnLLMResponseSchema>;
export type ChatCloseSessionInput = z.infer<
  typeof ChatCloseSessionInputSchema
>;
