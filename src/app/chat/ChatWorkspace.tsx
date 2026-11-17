"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { AudioPlayerBar } from "@/components/AudioPlayerBar";
import type { CEFRLevel } from "@/schemas/lesson";
import {
  ChatMessageCorrectionSchema,
  ChatSessionDetailsSchema,
  ChatSessionListResponseSchema,
  ChatTurnResultSchema,
  type ChatCoaching,
  type ChatMessageItem,
  type ChatSessionDetails,
  type ChatSessionSummary,
  type ChatTurnResult,
} from "@/schemas/chat";
import { useSpeechEngine } from "@/hooks/useSpeechEngine";
import { updateSessionStateField, useSessionState } from "@/hooks/useSessionState";

const scenarios = [
  {
    label: "Entretien développeur",
    opening:
      "Thanks for meeting with me today. Could you tell me about a technical project you really enjoyed working on?",
  },
  {
    label: "Daily standup",
    opening:
      "Good morning, everyone. What did you work on yesterday, and what are you planning to focus on today?",
  },
  {
    label: "Au restaurant",
    opening:
      "Welcome in! Have you had a chance to look at the menu, or can I help you choose something?",
  },
  {
    label: "Discussion livre / tech",
    opening:
      "I have been thinking about how technology changes the way we tell stories. What have you read or discovered lately?",
  },
  {
    label: "Voyage et hôtel",
    opening:
      "Hello, welcome to the hotel. What brings you to town, and how can I make your stay more comfortable?",
  },
] as const;

type ThreadEntry = {
  id: string;
  role: "user" | "assistant";
  content: string;
  coaching?: ChatCoaching;
  translation?: string;
};

type ChatSessionState = {
  selectedLevel: CEFRLevel;
  scenario: string;
  sessionId: string | null;
  thread: ThreadEntry[];
  draft: string;
  scores: number[];
  sessionStartedAt: number;
};

type RecognitionResult = { readonly transcript: string };
type RecognitionEvent = { readonly results: ArrayLike<RecognitionResult> };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionConstructor = new () => Recognition;
type SpeechWindow = Window & {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
};

function getErrorMessage(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }
  return "La requête n'a pas abouti.";
}

function formatSessionDate(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function restoreThread(
  messages: ChatSessionDetails["messages"],
): ThreadEntry[] {
  return messages.map((message) => {
    let coaching: ChatCoaching | undefined;
    let translation: string | undefined;
    if (message.correction_json) {
      try {
        const correction = ChatMessageCorrectionSchema.safeParse(
          JSON.parse(message.correction_json) as unknown,
        );
        if (correction.success) {
          coaching = correction.data.coaching;
          translation = correction.data.translation;
        }
      } catch {
        coaching = undefined;
        translation = undefined;
      }
    }

    return {
      id: `stored-${message.id}`,
      role: message.role,
      content: message.content,
      ...(coaching ? { coaching } : {}),
      ...(translation ? { translation } : {}),
    };
  });
}

export function ChatWorkspace({
  cefrLevel,
  hasProviderKey,
  initialSessions,
}: {
  cefrLevel: CEFRLevel;
  hasProviderKey: boolean;
  initialSessions: ChatSessionSummary[];
}) {
  const [session, setSession, isHydrated] = useSessionState<ChatSessionState>(
    "english-coach:chat:v1",
    {
      selectedLevel: cefrLevel,
      scenario: "",
      sessionId: null,
      thread: [],
      draft: "",
      scores: [],
      sessionStartedAt: 0,
    },
  );
  const {
    selectedLevel,
    scenario,
    sessionId,
    thread,
    draft,
    scores,
    sessionStartedAt,
  } = session;
  const setSelectedLevel: Dispatch<SetStateAction<CEFRLevel>> = useCallback(
    (update) => updateSessionStateField(setSession, "selectedLevel", update),
    [setSession],
  );
  const setScenario: Dispatch<SetStateAction<string>> = useCallback(
    (update) => updateSessionStateField(setSession, "scenario", update),
    [setSession],
  );
  const setSessionId: Dispatch<SetStateAction<string | null>> = useCallback(
    (update) => updateSessionStateField(setSession, "sessionId", update),
    [setSession],
  );
  const setThread: Dispatch<SetStateAction<ThreadEntry[]>> = useCallback(
    (update) => updateSessionStateField(setSession, "thread", update),
    [setSession],
  );
  const setDraft: Dispatch<SetStateAction<string>> = useCallback(
    (update) => updateSessionStateField(setSession, "draft", update),
    [setSession],
  );
  const setScores: Dispatch<SetStateAction<number[]>> = useCallback(
    (update) => updateSessionStateField(setSession, "scores", update),
    [setSession],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [sessions, setSessions] = useState(initialSessions);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(
    null,
  );
  const [microphoneSupported, setMicrophoneSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const speechEngine = useSpeechEngine();
  const recognitionRef = useRef<Recognition | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const speechWindow = window as SpeechWindow;
    setMicrophoneSupported(
      Boolean(
        speechWindow.SpeechRecognition ||
          speechWindow.webkitSpeechRecognition,
      ),
    );
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread, busy]);

  const refreshChatSessions = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await fetch("/api/chat/sessions", {
        cache: "no-store",
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(body));
      const parsed = ChatSessionListResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw new Error("La liste des conversations est invalide.");
      }
      setSessions(parsed.data.sessions);
    } catch (caught) {
      setHistoryError(
        caught instanceof Error
          ? caught.message
          : "Impossible d’actualiser les conversations.",
      );
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  async function closeActiveSession() {
    if (!sessionId) return;
    const userMessages = thread.filter(({ role }) => role === "user");
    if (userMessages.length === 0) return;

    const response = await fetch("/api/chat/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        scenario,
        exchanges: userMessages.length,
        score: scores.length
          ? scores.reduce((sum, score) => sum + score, 0) / scores.length
          : 0,
        lastUserMessage: userMessages.at(-1)?.content,
        duration_s: Math.max(
          0,
          Math.floor((Date.now() - sessionStartedAt) / 1000),
        ),
      }),
    });
    const body: unknown = await response.json();
    if (!response.ok) throw new Error(getErrorMessage(body));
  }

  async function openSavedSession(id: string) {
    if (!isHydrated || busy || loadingSessionId) return;
    if (id === sessionId) {
      setHistoryOpen(false);
      return;
    }

    setLoadingSessionId(id);
    setHistoryError("");
    try {
      const response = await fetch(`/api/chat/sessions/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(body));
      const parsed = ChatSessionDetailsSchema.safeParse(body);
      if (!parsed.success) {
        throw new Error("Le contenu de cette conversation est invalide.");
      }

      await closeActiveSession();
      const restoredThread = restoreThread(parsed.data.messages);
      setSession((current) => ({
        ...current,
        selectedLevel: parsed.data.session.cefr_level,
        scenario: parsed.data.session.scenario,
        sessionId: parsed.data.session.id,
        thread: restoredThread,
        draft: "",
        scores: restoredThread.flatMap((entry) =>
          entry.role === "user" && entry.coaching
            ? [entry.coaching.score]
            : [],
        ),
        sessionStartedAt: Date.now(),
      }));
      setHistoryOpen(false);
      setError("");
    } catch (caught) {
      setHistoryError(
        caught instanceof Error
          ? caught.message
          : "Impossible d’ouvrir cette conversation.",
      );
    } finally {
      setLoadingSessionId(null);
    }
  }

  async function removeSavedSession(id: string) {
    if (busy || deletingSessionId) return;
    setDeletingSessionId(id);
    setHistoryError("");
    try {
      const response = await fetch(
        `/api/chat/sessions/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(body));

      setSessions((current) => current.filter((saved) => saved.id !== id));
      setConfirmDeleteId(null);
      if (sessionId === id) {
        recognitionRef.current?.stop();
        setSession((current) => ({
          ...current,
          sessionId: null,
          thread: [],
          draft: "",
          scores: [],
          sessionStartedAt: 0,
        }));
      }
    } catch (caught) {
      setHistoryError(
        caught instanceof Error
          ? caught.message
          : "Impossible de supprimer cette conversation.",
      );
    } finally {
      setDeletingSessionId(null);
    }
  }

  function startConversation() {
    if (!isHydrated) return;
    const selectedScenario = scenario.trim();
    if (selectedScenario.length < 2) {
      setError("Choisissez un scénario ou saisissez un thème (2 caractères minimum).");
      return;
    }

    const preset = scenarios.find(({ label }) => label === selectedScenario);
    const opening =
      preset?.opening ??
      `Hi, let's talk about ${selectedScenario}. What would you like to share first?`;
    setScenario(selectedScenario);
    setSessionId(crypto.randomUUID());
    setThread([
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: opening,
      },
    ]);
    setScores([]);
    setDraft("");
    updateSessionStateField(setSession, "sessionStartedAt", Date.now());
    setError("");
  }

  async function sendMessage() {
    const content = draft.trim();
    if (
      !isHydrated ||
      !content ||
      !sessionId ||
      busy ||
      !hasProviderKey
    ) {
      return;
    }

    setBusy(true);
    setError("");
    try {
      const requestMessages: ChatMessageItem[] = [
        ...thread.map(({ role, content: message }): ChatMessageItem => ({
          role,
          content: message,
        })),
        { role: "user" as const, content },
      ].slice(-30);
      const response = await fetch("/api/chat/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario,
          cefrLevel: selectedLevel,
          messages: requestMessages,
          sessionId,
          duration_s: Math.max(
            0,
            Math.floor((Date.now() - sessionStartedAt) / 1000),
          ),
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getErrorMessage(body));
      }

      const parsedResult = ChatTurnResultSchema.safeParse(body);
      if (!parsedResult.success) {
        throw new Error("La réponse de conversation est invalide.");
      }
      const result: ChatTurnResult = parsedResult.data;
      setThread((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "user",
          content,
          coaching: {
            natural_version: result.natural_version,
            score: result.score,
            feedback_fr: result.feedback_fr,
            detected_mistakes: result.detected_mistakes,
            addedWords: result.addedWords,
          },
        },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: result.assistant_reply,
          translation: result.reply_translation_fr,
        },
      ]);
      setScores((current) => [...current, result.score]);
      setDraft("");
      void refreshChatSessions();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible de poursuivre la conversation.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function resetConversation() {
    if (!sessionId || busy || loadingSessionId) {
      return;
    }
    try {
      await closeActiveSession();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible d'enregistrer la clôture de la session.",
      );
      return;
    }
    recognitionRef.current?.stop();
    setSessionId(null);
    setThread([]);
    setScores([]);
    setDraft("");
    updateSessionStateField(setSession, "sessionStartedAt", 0);
    setError("");
    await refreshChatSessions();
  }

  function startDictation() {
    const speechWindow = window as SpeechWindow;
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result.transcript)
        .join(" ")
        .trim();
      if (transcript) {
        setDraft((current) =>
          current ? `${current.trimEnd()} ${transcript}` : transcript,
        );
      }
    };
    recognition.onerror = () => {
      setListening(false);
      setError("La dictée vocale a échoué. Vérifiez l’accès au microphone.");
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setError("");
    setListening(true);
    recognition.start();
  }

  function toggleDictation() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
    } else {
      startDictation();
    }
  }

  const exchangeCount = thread.filter(({ role }) => role === "user").length;

  return (
    <main className="animate-view-enter mx-auto w-full max-w-7xl min-w-0 px-4 pb-10 pt-6 sm:px-7 sm:pt-9">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-400">Expression spontanée</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#EDEDED] sm:text-3xl">
            Conversation
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Jouez un rôle en anglais, puis découvrez une reformulation naturelle
            et des conseils personnalisés en français.
          </p>
        </div>
        <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 font-mono text-xs font-medium text-zinc-300">
          Niveau {selectedLevel}
        </span>
      </header>

      <AudioPlayerBar compact engine={speechEngine} className="mb-5" />

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="order-last min-w-0 lg:order-first">
          {!sessionId ? (
        <section className="rounded-2xl border border-white/[0.08] bg-[#0A0A0A] p-5 sm:p-7">
          <div className="max-w-2xl">
            <p className="text-xs font-medium text-amber-200">Choisissez votre scène</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#EDEDED]">
              Où aimeriez-vous pratiquer ?
            </h2>
            <p className="mt-1 text-sm leading-6 text-zinc-400">
              L’assistant reste dans son rôle et adapte son anglais à votre niveau.
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {scenarios.map(({ label }) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setScenario(label);
                  setError("");
                }}
                aria-pressed={scenario === label}
                className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition ${
                  scenario === label
                    ? "border-white/[0.18] bg-[#EDEDED] text-[#0A0A0A]"
                    : "border-white/[0.12] bg-[#0A0A0A] text-zinc-300 hover:border-white/[0.22] hover:bg-[#141414]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
            <label className="block min-w-0">
              <span className="mb-2 block text-sm font-medium text-zinc-300">
                Scénario personnalisé
              </span>
              <input
                value={scenario}
                onChange={(event) => {
                  setScenario(event.target.value);
                  setError("");
                }}
                maxLength={120}
                placeholder="Ex. présenter mon projet à un client"
                className="h-10 w-full min-w-0 rounded-lg border border-white/[0.12] bg-[#000000] px-4 text-sm text-[#EDEDED] outline-none transition-colors duration-150 placeholder:text-zinc-500 focus:border-white/[0.3] focus:ring-2 focus:ring-white/[0.08]"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-300">
                Niveau CEFR
              </span>
              <select
                value={selectedLevel}
                onChange={(event) =>
                  setSelectedLevel(event.target.value as CEFRLevel)
                }
                className="h-10 w-full rounded-lg border border-white/[0.12] bg-[#0A0A0A] px-4 text-sm text-[#EDEDED] outline-none focus:border-white/[0.3] focus:ring-2 focus:ring-white/[0.08]"
              >
                {(["A1", "A2", "B1", "B2", "C1", "C2"] as const).map(
                  (level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>

          {!hasProviderKey ? (
            <p className="mt-4 rounded-2xl border border-amber-200/15 bg-amber-200/[0.05] p-3 text-sm leading-6 text-amber-100">
              Configurez une clé Gemini ou OpenRouter depuis la barre de navigation
              avant d’envoyer un message.
            </p>
          ) : null}
          <button
            type="button"
            onClick={startConversation}
            disabled={!isHydrated}
            className="mt-5 inline-flex h-10 items-center justify-center rounded-full bg-[#EDEDED] px-6 text-sm font-semibold text-[#0A0A0A] transition-colors duration-150 hover:bg-white active:scale-[0.985] disabled:opacity-50"
          >
            Démarrer l’échange <span aria-hidden="true" className="ml-2">→</span>
          </button>
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0A0A0A]">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-4 sm:px-6">
            <div className="min-w-0">
              <p className="break-words text-sm font-medium text-white">{scenario}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {selectedLevel} <span aria-hidden="true">·</span> {exchangeCount} échange
                {exchangeCount === 1 ? "" : "s"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void resetConversation()}
              disabled={busy}
              className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-white/[0.1] bg-white/[0.035] px-4 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Nouvelle conversation
            </button>
          </header>

          <div className="min-h-[280px] space-y-5 px-4 py-5 sm:px-6">
            {thread.map((entry) => (
              <article
                key={entry.id}
                className={`min-w-0 ${entry.role === "user" ? "ml-auto max-w-[92%] sm:max-w-[82%]" : "mr-auto max-w-[92%] sm:max-w-[82%]"}`}
              >
                <p className={`mb-1.5 text-[11px] ${entry.role === "user" ? "text-right text-zinc-500" : "text-zinc-500"}`}>
                  {entry.role === "user" ? "Vous" : "Votre partenaire"}
                </p>
                <div
                  className={`min-w-0 break-words rounded-2xl px-4 py-3.5 text-sm leading-6 ${
                    entry.role === "user"
                      ? "rounded-br-md bg-white text-zinc-950"
                      : "rounded-bl-md border border-white/[0.08] bg-[#111111] text-zinc-100"
                  }`}
                >
                  {entry.content}
                  {entry.role === "assistant" ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-2.5">
                      <AudioPlayerBar
                        mode="compact"
                        engine={speechEngine}
                        text={entry.content}
                        sourceId={`chat:${sessionId}:${entry.id}:reply`}
                      />
                      {entry.translation ? (
                        <details className="min-w-0 flex-1">
                          <summary className="min-h-9 cursor-pointer list-none rounded-full border border-white/[0.08] px-3 py-2 text-center text-xs text-zinc-400 transition hover:bg-white/[0.06] hover:text-white">
                            Traduire
                          </summary>
                          <p className="mt-2 break-words text-sm leading-6 text-zinc-300">
                            {entry.translation}
                          </p>
                        </details>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {entry.coaching ? (
                  <details className="mt-2 overflow-hidden rounded-2xl border border-white/[0.07] bg-black/20">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3.5 text-xs text-zinc-300">
                      <span>
                        Coaching <span className="text-zinc-600">·</span>{" "}
                        <span className="font-semibold tabular-nums text-white">
                          {entry.coaching.score.toFixed(1)}/10
                        </span>
                      </span>
                      <span className="text-zinc-500">Afficher</span>
                    </summary>
                    <div className="space-y-3 border-t border-white/[0.06] px-3.5 py-3.5">
                      {entry.coaching.score < 8.5 ||
                      entry.coaching.natural_version.toLowerCase() !==
                        entry.content.toLowerCase() ? (
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <p className="min-w-0 flex-1 break-words text-sm leading-6 text-zinc-200">
                            <span className="text-zinc-500">Version native : </span>
                            {entry.coaching.natural_version}
                          </p>
                          <AudioPlayerBar
                            mode="compact"
                            engine={speechEngine}
                            text={entry.coaching.natural_version}
                            sourceId={`chat:${sessionId}:${entry.id}:native`}
                          />
                        </div>
                      ) : (
                        <p className="text-sm text-emerald-200">
                          Votre formulation est déjà naturelle.
                        </p>
                      )}
                      <p className="text-sm leading-6 text-zinc-400">
                        {entry.coaching.feedback_fr}
                      </p>
                      {entry.coaching.detected_mistakes.length > 0 ? (
                        <ul className="space-y-2 border-t border-white/[0.06] pt-3">
                          {entry.coaching.detected_mistakes.map((mistake, index) => (
                            <li key={`${mistake.user_fragment}-${index}`} className="min-w-0 text-sm leading-6">
                              <p className="break-words text-rose-200">
                                <span className="line-through">{mistake.user_fragment}</span>
                                {" → "}
                                <span className="text-emerald-200">{mistake.correction}</span>
                              </p>
                              <p className="text-xs text-zinc-500">
                                {mistake.category} · {mistake.explanation}
                              </p>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {entry.coaching.addedWords.length > 0 ? (
                        <p className="inline-flex min-h-8 items-center rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-3 text-xs text-emerald-200">
                          Ajouté aux révisions : {entry.coaching.addedWords.join(", ")}
                        </p>
                      ) : null}
                    </div>
                  </details>
                ) : null}
              </article>
            ))}

            {busy ? (
              <div
                role="status"
                aria-label="Réponse en cours"
                className="mr-auto w-2/3 max-w-sm animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.04] p-4"
              >
                <div className="h-3 w-4/5 rounded-full bg-white/[0.08]" />
                <div className="mt-3 h-3 w-3/5 rounded-full bg-white/[0.06]" />
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-white/[0.07] p-3 sm:p-4">
            {!hasProviderKey ? (
              <p className="mb-3 text-sm text-amber-100">
                Ajoutez une clé Gemini ou OpenRouter dans Configuration IA pour continuer.
              </p>
            ) : null}
            <div className="flex items-end gap-2 rounded-2xl border border-white/[0.1] bg-black/20 p-2">
              <textarea
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  event.currentTarget.style.height = "auto";
                  event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 160)}px`;
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                rows={1}
                maxLength={3000}
                disabled={busy}
                aria-label="Votre message en anglais"
                placeholder="Écrivez votre réponse en anglais…"
                className="max-h-40 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm leading-5 text-white outline-none placeholder:text-zinc-600 disabled:opacity-50"
              />
              {microphoneSupported ? (
                <button
                  type="button"
                  onClick={toggleDictation}
                  aria-label={listening ? "Arrêter la dictée" : "Dicter un message"}
                  aria-pressed={listening}
                  className={`grid size-11 shrink-0 place-items-center rounded-full border text-xs transition ${
                    listening
                      ? "border-rose-300/30 bg-rose-300/[0.1] text-rose-100"
                      : "border-white/[0.08] text-zinc-400 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  {listening ? "Arrêter" : "Micro"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void sendMessage()}
                disabled={busy || !draft.trim() || !hasProviderKey}
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-white px-4 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
              >
                Envoyer
              </button>
            </div>
            <p className="mt-2 px-2 text-[11px] text-zinc-600">
              Entrée pour envoyer <span aria-hidden="true">·</span> Maj + Entrée pour un saut de ligne
            </p>
          </div>
        </section>
          )}
        </div>

        <aside className="order-first min-w-0 lg:order-last">
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0A0A0A]">
            <button
              type="button"
              onClick={() => setHistoryOpen((open) => !open)}
              aria-expanded={historyOpen}
              className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left lg:hidden"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium text-white">
                  Conversations récentes
                </span>
                <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-xs tabular-nums text-zinc-300">
                  {sessions.length}
                </span>
              </span>
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="none"
                className={`size-4 shrink-0 text-zinc-400 transition-transform duration-150 ${
                  historyOpen ? "rotate-180" : ""
                }`}
              >
                <path
                  d="m5 7.5 5 5 5-5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <div className="hidden px-4 pb-3 pt-4 lg:block">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-white">
                  Conversations récentes
                </h2>
                <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-xs tabular-nums text-zinc-300">
                  {sessions.length}
                </span>
              </div>
            </div>

            <div className={`${historyOpen ? "block" : "hidden"} lg:block`}>
              {historyLoading ? (
                <div
                  role="status"
                  aria-label="Chargement des conversations"
                  className="space-y-3 px-4 pb-4"
                >
                  <div className="skeleton-shimmer h-14 rounded-xl" />
                  <div className="skeleton-shimmer h-14 rounded-xl" />
                  <span className="sr-only">Chargement des conversations…</span>
                </div>
              ) : sessions.length > 0 ? (
                <ul className="max-h-[70vh] divide-y divide-white/[0.06] overflow-y-auto px-3 pb-2 lg:max-h-[calc(100vh-12rem)]">
                  {sessions.map((savedSession) => {
                    const isActive = savedSession.id === sessionId;
                    const isLoading = loadingSessionId === savedSession.id;
                    const isDeleting = deletingSessionId === savedSession.id;
                    return (
                      <li key={savedSession.id} className="py-2">
                        <div
                          className={`flex min-w-0 items-start gap-1 rounded-xl p-1 transition-colors ${
                            isActive ? "bg-amber-200/[0.06]" : "hover:bg-white/[0.035]"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => void openSavedSession(savedSession.id)}
                            disabled={
                              !isHydrated ||
                              busy ||
                              loadingSessionId !== null ||
                              deletingSessionId !== null
                            }
                            aria-pressed={isActive}
                            className="min-h-11 min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70 disabled:cursor-wait disabled:opacity-60"
                          >
                            <span className="flex min-w-0 items-center justify-between gap-2">
                              <span className="truncate text-xs font-medium text-zinc-100">
                                {savedSession.scenario}
                              </span>
                              <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-500">
                                {formatSessionDate(savedSession.updated_at)}
                              </span>
                            </span>
                            <span className="mt-1 block line-clamp-2 break-words text-xs leading-5 text-zinc-400">
                              {savedSession.preview}
                            </span>
                            <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-zinc-500">
                              <span>{savedSession.cefr_level}</span>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">
                                {savedSession.message_count} messages
                              </span>
                              {isActive ? (
                                <span className="text-amber-200">En cours</span>
                              ) : null}
                              {isLoading ? (
                                <span className="text-amber-100">Ouverture…</span>
                              ) : null}
                            </span>
                          </button>

                          {confirmDeleteId === savedSession.id ? (
                            <div className="flex shrink-0 flex-col gap-1">
                              <button
                                type="button"
                                onClick={() => void removeSavedSession(savedSession.id)}
                                disabled={isDeleting || loadingSessionId !== null}
                                className="min-h-9 rounded-lg px-2 text-[10px] font-medium text-rose-200 transition hover:bg-rose-300/[0.1] disabled:opacity-50"
                              >
                                {isDeleting ? "Suppression…" : "Supprimer"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                disabled={isDeleting}
                                className="min-h-8 rounded-lg px-2 text-[10px] text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
                              >
                                Annuler
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(savedSession.id)}
                              disabled={
                                busy ||
                                deletingSessionId !== null ||
                                loadingSessionId !== null
                              }
                              aria-label={`Supprimer la conversation : ${savedSession.scenario}`}
                              title="Supprimer la conversation"
                              className="grid size-10 shrink-0 place-items-center rounded-lg text-zinc-500 transition hover:bg-rose-300/[0.08] hover:text-rose-200 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-200 disabled:opacity-40"
                            >
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 24 24"
                                fill="none"
                                className="size-4"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-4 pb-4 text-sm leading-6 text-zinc-400">
                  Vos anciens échanges apparaîtront ici. Démarrez une conversation pour les retrouver.
                </p>
              )}
              {sessionId ? (
                <div className="border-t border-white/[0.06] px-4 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryOpen(false);
                      void resetConversation();
                    }}
                    disabled={busy || loadingSessionId !== null}
                    className="min-h-11 w-full rounded-full border border-white/[0.1] bg-white/[0.04] px-4 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Nouvelle conversation
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </aside>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-300/[0.06] px-4 py-3 text-sm leading-6 text-rose-100"
        >
          {error}
        </p>
      ) : null}
      {historyError ? (
        <p
          role="alert"
          className="mt-3 rounded-2xl border border-rose-300/20 bg-rose-300/[0.06] px-4 py-3 text-sm leading-6 text-rose-100"
        >
          {historyError}
        </p>
      ) : null}
    </main>
  );
}
