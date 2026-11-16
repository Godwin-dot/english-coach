import type { CEFRLevel } from "@/schemas/lesson";
import type { ChatMessageItem } from "@/schemas/chat";

export function buildChatTurnPrompts({
  scenario,
  cefrLevel,
  messages,
  targetWords,
}: {
  scenario: string;
  cefrLevel: CEFRLevel;
  messages: ChatMessageItem[];
  targetWords: string[];
}): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt: [
      `You are a fluent, friendly English conversation partner playing this role: ${scenario}.`,
      `Adapt vocabulary, pace, and complexity to CEFR ${cefrLevel}, without sounding like a textbook.`,
      "Return only one valid JSON object matching the requested schema.",
      "Continue the conversation naturally. assistant_reply must be 2 to 4 concise sentences, stay in character, and always end with an open question that invites the learner to speak again.",
      "Do not put corrections or language analysis in assistant_reply; keep the roleplay and the French coaching separate.",
      "Assess only the latest user message for meaning, grammar, vocabulary, naturalness, and idiomatic phrasing.",
      "Accept correct alternatives and natural informal English. If the latest message is correct and idiomatic, detected_mistakes must be empty and score must be at least 8.5.",
      "Only identify real errors or clearly awkward phrasing. For each one quote an exact fragment from the latest user message, correct it, classify it, and explain it briefly in French.",
      "In missed_vocab, extract only an isolated English word or a very short expression of 1 to 2 words that was omitted, misspelled, or replaced by a false friend in the latest user message (for example: 'rely on', 'schedule', 'accurate'). Never include a clause or sentence fragment as a term. Give its French meaning, a corrected English context_sentence, and a short French note. Return at most 3 entries and [] when no specific vocabulary item was missed.",
      "natural_version should preserve the learner's meaning while showing a natural English phrasing. Give supportive, concise coaching in French.",
      targetWords.length
        ? `When it fits organically, weave one of these recently learned English terms into the next reply: ${targetWords.join(", ")}.`
        : "Keep the roleplay vocabulary useful and appropriate for the learner.",
    ].join(" "),
    userPrompt: JSON.stringify({
      scenario,
      cefrLevel,
      targetWords,
      conversation: messages,
      latestUserMessage: messages.at(-1)?.content,
      requiredShape: {
        assistant_reply:
          "2-4 short in-character English sentences ending with an open question",
        reply_translation_fr: "Faithful French translation of assistant_reply",
        natural_version: "Idiomatic English version of the latest user message",
        score: "Naturalness/accuracy score from 0 to 10",
        feedback_fr: "One or two supportive French coaching sentences",
        detected_mistakes: [
          {
            user_fragment: "Exact fragment from latest user message",
            correction: "Corrected natural English phrase",
            category: "Grammar, vocabulary, preposition, word order, etc.",
            explanation: "Brief explanation in French",
          },
        ],
        missed_vocab: [
          {
            term: "One missed isolated English word or short expression (1-2 words; never a clause or sentence)",
            translation: "French meaning",
            context_sentence: "Corrected complete English example sentence using the term",
            note_fr: "Brief French note about the mistake",
          },
        ],
      },
    }),
  };
}
