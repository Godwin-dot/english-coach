"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { AudioPlayerBar } from "@/components/AudioPlayerBar";
import { useSpeechEngine } from "@/hooks/useSpeechEngine";
import type {
  MistakeCategoryCount,
  RecentMistake,
  RecentMistakes,
} from "@/domain/drill";
import {
  DictationExerciseSchema,
  type DictationExercise,
  type DrillEvaluationResult,
  type GeneratedDrillPrompt,
} from "@/schemas/drill";
import {
  evaluateDictation,
  type DictationEvaluation,
} from "@/lib/dictationDiff";
import type { CEFRLevel } from "@/schemas/lesson";
import { updateSessionStateField, useSessionState } from "@/hooks/useSessionState";
import { useHotkeys } from "@/hooks/useHotkeys";

type DrillExercise = GeneratedDrillPrompt & {
  cefrLevel: CEFRLevel;
  topic: string | null;
  recentMistakes: RecentMistake[];
};

type DrillEvaluation = DrillEvaluationResult & {
  recentMistakes: RecentMistake[];
  categories: MistakeCategoryCount[];
  totalMistakes: number;
  addedWords: string[];
};

type DrillSessionState = {
  mode: "translation" | "dictation";
  exercise: DrillExercise | null;
  dictationExercise: DictationExercise | null;
  dictationAttempt: string;
  dictationResult: DictationEvaluation | null;
  selectedLevel: CEFRLevel;
  topic: string;
  translation: string;
  evaluation: DrillEvaluation | null;
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

function MistakeList({ mistakes }: { mistakes: RecentMistake[] }) {
  if (mistakes.length === 0) {
    return (
      <p className="mt-4 text-sm leading-6 text-zinc-400">
        Les erreurs repérées pendant vos traductions apparaîtront ici.
      </p>
    );
  }

  return (
    <ul className="mt-4 space-y-3">
      {mistakes.map((mistake) => (
        <li
          key={mistake.id}
          className="min-w-0 rounded-2xl border border-white/[0.06] bg-black/20 p-3.5"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="min-w-0 break-words text-sm text-rose-200 line-through decoration-rose-300/70">
              {mistake.userText}
            </p>
            {mistake.category ? (
              <span className="rounded-full border border-amber-200/10 bg-amber-200/[0.06] px-2.5 py-1 text-[11px] text-amber-100">
                {mistake.category}
              </span>
            ) : null}
          </div>
          <p className="mt-2 break-words text-sm text-emerald-200">
            {mistake.correction}
          </p>
          {mistake.explanation ? (
            <p className="mt-1.5 text-xs leading-5 text-zinc-400">
              {mistake.explanation}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function DrillWorkspace({
  cefrLevel,
  interests,
  initialMistakes,
  hasProviderKey,
  retrySentence,
}: {
  cefrLevel: CEFRLevel;
  interests: string[];
  initialMistakes: RecentMistakes;
  hasProviderKey: boolean;
  retrySentence: string | null;
}) {
  const [session, setSession, isHydrated] = useSessionState<DrillSessionState>(
    "english-coach:drill:v1",
    {
      mode: "translation",
      exercise: null,
      dictationExercise: null,
      dictationAttempt: "",
      dictationResult: null,
      selectedLevel: cefrLevel,
      topic: "",
      translation: "",
      evaluation: null,
    },
  );
  const {
    exercise,
    selectedLevel,
    topic,
    translation,
    evaluation,
    dictationExercise,
    dictationAttempt = "",
    dictationResult = null,
  } = session;
  const mode = session.mode;
  const setExercise: Dispatch<SetStateAction<DrillExercise | null>> = useCallback(
    (update) => updateSessionStateField(setSession, "exercise", update),
    [setSession],
  );
  const setSelectedLevel: Dispatch<SetStateAction<CEFRLevel>> = useCallback(
    (update) => updateSessionStateField(setSession, "selectedLevel", update),
    [setSession],
  );
  const setTopic: Dispatch<SetStateAction<string>> = useCallback(
    (update) => updateSessionStateField(setSession, "topic", update),
    [setSession],
  );
  const setTranslation: Dispatch<SetStateAction<string>> = useCallback(
    (update) => updateSessionStateField(setSession, "translation", update),
    [setSession],
  );
  const setEvaluation: Dispatch<SetStateAction<DrillEvaluation | null>> = useCallback(
    (update) => updateSessionStateField(setSession, "evaluation", update),
    [setSession],
  );
  const setMode = useCallback(
    (update: SetStateAction<"translation" | "dictation">) =>
      updateSessionStateField(setSession, "mode", update),
    [setSession],
  );
  const setDictationExercise: Dispatch<SetStateAction<DictationExercise | null>> =
    useCallback(
      (update) => updateSessionStateField(setSession, "dictationExercise", update),
      [setSession],
    );
  const setDictationAttempt = useCallback(
    (update: SetStateAction<string>) =>
      updateSessionStateField(setSession, "dictationAttempt", update),
    [setSession],
  );
  const setDictationResult: Dispatch<
    SetStateAction<DictationEvaluation | null>
  > = useCallback(
    (update) => updateSessionStateField(setSession, "dictationResult", update),
    [setSession],
  );
  const [mistakeSummary, setMistakeSummary] = useState(initialMistakes);
  const [busy, setBusy] = useState<"generate" | "evaluate" | null>(null);
  const [error, setError] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [microphoneSupported, setMicrophoneSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const speechEngine = useSpeechEngine();
  const startedAt = useRef(Date.now());
  const recognitionRef = useRef<Recognition | null>(null);

  const loadExercise = useCallback(async (sentence?: string | null) => {
    setBusy("generate");
    setError("");
    setEvaluation(null);
    setTranslation("");
    setShowHint(false);
    try {
      if (sentence) {
        setExercise({
          french_sentence: sentence,
          target_vocab: [],
          focus_grammar: "Phrase reprise de votre historique",
          hint_fr: "",
          cefrLevel: selectedLevel,
          topic: null,
          recentMistakes: [],
        });
        startedAt.current = Date.now();
        return;
      }
      const response = await fetch("/api/drill/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim() || undefined,
          cefrLevel: selectedLevel,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getErrorMessage(body));
      }
      setExercise(body as DrillExercise);
      startedAt.current = Date.now();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible de préparer une nouvelle phrase.",
      );
    } finally {
      setBusy(null);
    }
  }, [selectedLevel, topic]);

  const loadDictationExercise = useCallback(async () => {
    setBusy("generate");
    setError("");
    setDictationResult(null);
    setDictationAttempt("");
    setShowHint(false);
    try {
      const response = await fetch("/api/drill/dictation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          topic: topic.trim() || undefined,
          cefrLevel: selectedLevel,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(body));
      if (
        typeof body !== "object" ||
        body === null ||
        !("exercise" in body)
      ) {
        throw new Error("La réponse du serveur est invalide.");
      }
      const parsedExercise = DictationExerciseSchema.safeParse(body.exercise);
      if (!parsedExercise.success) {
        throw new Error("La réponse du serveur est invalide.");
      }
      setDictationExercise(parsedExercise.data);
      startedAt.current = Date.now();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible de préparer une dictée.",
      );
    } finally {
      setBusy(null);
    }
  }, [selectedLevel, topic, setDictationAttempt, setDictationExercise, setDictationResult]);

  useEffect(() => {
    if (isHydrated && mode === "translation" && !exercise) {
      void loadExercise(retrySentence);
    }
    // Load once from the URL; later settings changes only affect the next request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise, isHydrated, retrySentence, mode]);

  useEffect(() => {
    if (isHydrated && mode === "dictation" && !dictationExercise) {
      void loadDictationExercise();
    }
  }, [dictationExercise, isHydrated, loadDictationExercise, mode]);

  useEffect(() => {
    if (isHydrated) startedAt.current = Date.now();
  }, [isHydrated]);

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

  async function submitTranslation() {
    if (!exercise || !translation.trim() || busy !== null) {
      return;
    }

    setBusy("evaluate");
    setError("");
    try {
      const response = await fetch("/api/drill/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frenchSentence: exercise.french_sentence,
          userTranslation: translation,
          targetVocab: exercise.target_vocab,
          cefrLevel: exercise.cefrLevel,
          duration_s: Math.max(
            0,
            Math.floor((Date.now() - startedAt.current) / 1000),
          ),
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getErrorMessage(body));
      }
      const result = body as DrillEvaluation;
      setEvaluation(result);
      setMistakeSummary({
        mistakes: result.recentMistakes,
        categories: result.categories,
        totalCount: result.totalMistakes,
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible d'évaluer cette traduction.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function submitDictation() {
    if (!dictationExercise || !dictationAttempt.trim() || busy !== null) return;
    setBusy("evaluate");
    setError("");
    try {
      const result = evaluateDictation(
        dictationExercise.sentence_en,
        dictationAttempt,
      );
      const response = await fetch("/api/drill/dictation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "record",
          sentenceEn: dictationExercise.sentence_en,
          userAttempt: dictationAttempt,
          accuracyPct: result.accuracyPct,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(body));
      setDictationResult(result);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible d’enregistrer le résultat de la dictée.",
      );
    } finally {
      setBusy(null);
    }
  }

  function startDictation() {
    const speechWindow = window as SpeechWindow;
    const RecognitionConstructor =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!RecognitionConstructor) {
      return;
    }

    const recognition = new RecognitionConstructor();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const spokenText = Array.from(event.results)
        .map((result) => result.transcript)
        .join(" ")
        .trim();
      if (spokenText) {
        setTranslation((current) =>
          current ? `${current.trimEnd()} ${spokenText}` : spokenText,
        );
      }
    };
    recognition.onerror = () => {
      setError("La dictée vocale n'a pas pu démarrer. Vérifiez les permissions du microphone.");
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setError("");
    setListening(true);
    recognition.start();
  }

  const scoreStyle =
    evaluation && evaluation.score >= 8
      ? "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100"
      : evaluation && evaluation.score >= 5
        ? "border-amber-300/20 bg-amber-300/[0.08] text-amber-100"
        : "border-rose-300/20 bg-rose-300/[0.08] text-rose-100";

  useHotkeys([
    {
      key: "Enter",
      ctrlOrMeta: true,
      allowInInputs: true,
      enabled:
        busy === null &&
        ((mode === "translation" && exercise !== null) ||
          (mode === "dictation" && dictationExercise != null)),
      action: (event) => {
        event.preventDefault();
        if (mode === "dictation") {
          if (dictationResult) {
            void loadDictationExercise();
          } else {
            void submitDictation();
          }
        } else if (evaluation) {
          void loadExercise();
        } else {
          void submitTranslation();
        }
      },
    },
    {
      key: "r",
      altKey: true,
      allowInInputs: true,
      enabled:
        (mode === "dictation" && dictationExercise !== null) ||
        (mode === "translation" && evaluation !== null && busy === null),
      action: (event) => {
        event.preventDefault();
        if (mode === "dictation" && dictationExercise) {
          speechEngine.speak(
            dictationExercise.sentence_en,
            `dictation:${dictationExercise.id}`,
          );
        } else if (evaluation) {
          speechEngine.speak(
            evaluation.ideal_translation,
            `drill:${exercise?.french_sentence}:reference`,
          );
        }
      },
    },
    {
      key: "r",
      enabled: mode === "dictation" && dictationExercise !== null,
      action: (event) => {
        event.preventDefault();
        if (dictationExercise) {
          speechEngine.speak(
            dictationExercise.sentence_en,
            `dictation:${dictationExercise.id}`,
          );
        }
      },
    },
  ]);

  return (
    <main className="animate-view-enter mx-auto max-w-6xl px-4 pb-10 pt-6 sm:px-7 sm:pt-9">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-400">Pratiquez la production active</p>
          <h1 className="mt-1 font-serif text-3xl tracking-[-0.04em] text-white sm:text-4xl">
            {mode === "dictation"
              ? "Dictée audio anglaise"
              : "Traduction française → anglaise"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            {mode === "dictation"
              ? "Écoutez une phrase anglaise adaptée à votre niveau, puis transcrivez-la sans la voir."
              : "Une phrase à la fois, à votre niveau. Vos mots appris et vos erreurs récentes orientent les exercices."}
          </p>
        </div>
        <div className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3.5 py-2 text-xs text-zinc-300">
          {mistakeSummary.totalCount} point
          {mistakeSummary.totalCount === 1 ? "" : "s"} de vigilance
        </div>
      </header>

      <div
        role="group"
        aria-label="Mode d’entraînement"
        className="mb-5 inline-flex max-w-full flex-wrap gap-1 rounded-full border border-white/[0.08] bg-[#111114] p-1"
      >
        {(
          [
            ["translation", "Traduction FR → EN"],
            ["dictation", "Dictée audio EN"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
            className={`min-h-11 rounded-full px-4 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-200 ${
              mode === value
                ? "bg-white text-zinc-950"
                : "text-zinc-300 hover:bg-white/[0.06]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <AudioPlayerBar compact engine={speechEngine} className="mb-5" />

      <section
        aria-label="Configuration de l’exercice"
        className="mb-3 grid gap-3 rounded-3xl border border-white/[0.08] bg-[#111114] p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:p-5"
      >
        <div className="min-w-0 space-y-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
            <label className="block min-w-0 text-sm font-medium text-zinc-300">
              Thème ou situation
              <input
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                maxLength={120}
                placeholder="Ex. préparer une présentation"
                className="mt-2 h-11 w-full rounded-xl border border-white/[0.1] bg-black/25 px-3.5 text-sm text-zinc-100 outline-none transition focus:border-violet-200/40 focus:ring-2 focus:ring-violet-200/10"
              />
            </label>
            <label className="block text-sm font-medium text-zinc-300">
              Niveau CEFR
              <select
                value={selectedLevel}
                onChange={(event) =>
                  setSelectedLevel(event.target.value as CEFRLevel)
                }
                className="mt-2 h-11 w-full rounded-xl border border-white/[0.1] bg-black/25 px-3.5 text-sm text-zinc-100 outline-none transition focus:border-violet-200/40 focus:ring-2 focus:ring-violet-200/10"
              >
                {(["A1", "A2", "B1", "B2", "C1", "C2"] as const).map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </label>
          </div>
          {interests.length ? (
            <div className="flex flex-wrap gap-2">
              {interests.map((interest) => (
                <button
                  key={interest}
                  type="button"
                  onClick={() => setTopic(interest)}
                  aria-pressed={topic === interest}
                  className={`min-h-10 rounded-full border px-3.5 text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-200 ${
                    topic === interest
                      ? "border-violet-200/30 bg-violet-200/[0.09] text-violet-100"
                      : "border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]"
                  }`}
                >
                  {interest}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() =>
            mode === "dictation"
              ? void loadDictationExercise()
              : void loadExercise()
          }
          disabled={busy !== null}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200 active:scale-[0.98] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {busy === "generate"
            ? "Génération…"
            : mode === "dictation"
              ? "Nouvelle dictée"
              : "Générer une phrase"}
        </button>
      </section>

      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.75fr)]">
        <section className="min-w-0 rounded-3xl border border-white/[0.08] bg-[#111114] p-5 sm:p-7">
          {mode === "dictation" ? (
            dictationExercise ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="rounded-full border border-amber-300/[0.14] bg-amber-300/[0.07] px-3 py-1.5 text-xs font-medium text-amber-100">
                    Dictée · {dictationExercise.cefr_level}
                  </span>
                  {dictationExercise.topic ? (
                    <span className="max-w-full break-words text-xs text-zinc-500">
                      {dictationExercise.topic}
                    </span>
                  ) : null}
                </div>

                <div className="mt-6 rounded-3xl border border-white/[0.07] bg-black/20 p-5 text-center sm:p-8">
                  <p className="text-sm text-zinc-400">
                    Écoutez la phrase, puis écrivez ce que vous entendez.
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        speechEngine.setRate(1);
                        speechEngine.speak(
                          dictationExercise.sentence_en,
                          `dictation:${dictationExercise.id}`,
                        );
                      }}
                      className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      Écouter la phrase <span className="ml-2 text-xs text-zinc-600">1x</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        speechEngine.setRate(0.75);
                        speechEngine.speak(
                          dictationExercise.sentence_en,
                          `dictation:${dictationExercise.id}`,
                        );
                      }}
                      className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.035] px-4 text-sm text-zinc-200 transition hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-200"
                    >
                      Écouter au ralenti (0.75x)
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowHint((visible) => !visible)}
                      aria-expanded={showHint}
                      className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/[0.08] px-4 text-sm text-zinc-300 transition hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200"
                    >
                      {showHint ? "Masquer l’indice" : "Indice"}
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-zinc-500">
                    R ou Alt + R pour réécouter
                  </p>
                  {showHint ? (
                    <div className="mt-4 rounded-2xl border border-amber-200/[0.12] bg-amber-200/[0.04] px-4 py-3 text-left">
                      <p className="text-sm text-amber-100">
                        <span className="tabular-nums">
                          {dictationExercise.sentence_en.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0}
                        </span>{" "}
                        mots
                      </p>
                      <p className="mt-1 text-sm leading-6 text-zinc-300">
                        {dictationExercise.translation_fr}
                      </p>
                    </div>
                  ) : null}
                </div>

                {dictationResult ? (
                  <section
                    aria-live="polite"
                    className="mt-5 animate-fade-in-up rounded-2xl border border-white/[0.08] bg-black/15 p-4 sm:p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-base font-medium text-white">Précision</h2>
                      <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-3 py-1.5 text-lg font-semibold tabular-nums text-emerald-100">
                        {dictationResult.accuracyPct.toLocaleString("fr-FR", {
                          maximumFractionDigits: 1,
                        })}%
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-x-1.5 gap-y-2 text-sm leading-7">
                      {dictationResult.tokens.map((token, index) => {
                        if (token.type === "correct") {
                          return (
                            <span
                              key={`${token.expected}-${index}`}
                              className="rounded-md bg-emerald-500/10 px-1 text-emerald-300"
                            >
                              {token.expected}
                            </span>
                          );
                        }
                        if (token.type === "substitution") {
                          return (
                            <span
                              key={`${token.actual}-${index}`}
                              className="rounded-md bg-amber-500/10 px-1 text-amber-200"
                            >
                              [{token.actual} → {token.expected}]
                            </span>
                          );
                        }
                        return (
                          <span
                            key={`${token.type}-${token.expected ?? token.actual}-${index}`}
                            className="rounded-md bg-rose-500/10 px-1 text-rose-200"
                          >
                            [{token.type === "missing" ? `manquant : ${token.expected}` : `en trop : ${token.actual}`}]
                          </span>
                        );
                      })}
                    </div>
                    <p className="mt-5 font-serif text-lg leading-7 text-white">
                      {dictationExercise.sentence_en}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-zinc-300">
                      {dictationExercise.translation_fr}
                    </p>
                    {dictationExercise.focus_note_fr ? (
                      <p className="mt-4 rounded-xl border border-violet-200/[0.1] bg-violet-200/[0.04] px-3.5 py-3 text-sm leading-6 text-violet-100">
                        {dictationExercise.focus_note_fr}
                      </p>
                    ) : null}
                    <AudioPlayerBar
                      className="mt-4 max-w-full"
                      mode="compact"
                      engine={speechEngine}
                      text={dictationExercise.sentence_en}
                      sourceId={`dictation:${dictationExercise.id}`}
                    />
                    <button
                      type="button"
                      onClick={() => void loadDictationExercise()}
                      disabled={busy !== null}
                      className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      Phrase suivante <span aria-hidden="true" className="ml-2">→</span>
                      <span className="hidden text-xs font-normal text-zinc-600 sm:inline">(Ctrl + Entrée)</span>
                    </button>
                  </section>
                ) : (
                  <>
                    <label
                      htmlFor="dictation-attempt"
                      className="mt-5 block text-sm font-medium text-zinc-300"
                    >
                      Votre transcription en anglais
                    </label>
                    <textarea
                      id="dictation-attempt"
                      value={dictationAttempt}
                      onChange={(event) => setDictationAttempt(event.target.value)}
                      disabled={busy !== null}
                      maxLength={1000}
                      rows={4}
                      placeholder="Écrivez la phrase entendue…"
                      className="mt-2 min-h-32 w-full resize-y rounded-2xl border border-white/[0.1] bg-black/25 px-4 py-3.5 text-base leading-7 text-zinc-100 outline-none transition focus:border-violet-200/40 focus:ring-2 focus:ring-violet-200/10 disabled:opacity-70"
                    />
                    <button
                      type="button"
                      onClick={() => void submitDictation()}
                      disabled={!dictationAttempt.trim() || busy !== null}
                      className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      {busy === "evaluate" ? "Vérification…" : "Vérifier la dictée"}
                      <span className="hidden text-xs font-normal text-zinc-600 sm:inline">(Ctrl + Entrée)</span>
                    </button>
                  </>
                )}
              </>
            ) : busy === "generate" ? (
              <div className="space-y-5" aria-label="Préparation de la dictée">
                <div className="skeleton-shimmer h-4 w-32 rounded-full" />
                <div className="skeleton-shimmer h-28 rounded-2xl" />
                <div className="skeleton-shimmer h-11 w-52 rounded-full" />
              </div>
            ) : (
              <div className="rounded-2xl border border-white/[0.07] bg-black/15 p-5 sm:p-6">
                <p className="text-sm leading-6 text-zinc-300">
                  {hasProviderKey
                    ? "La dictée n’a pas pu être préparée."
                    : "Ajoutez une clé Gemini ou OpenRouter depuis Configuration IA pour générer une dictée."}
                </p>
                <button
                  type="button"
                  onClick={() => void loadDictationExercise()}
                  disabled={busy !== null}
                  className="mt-4 inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-medium text-zinc-950 disabled:opacity-50"
                >
                  Réessayer
                </button>
              </div>
            )
          ) : (busy === "generate" && !exercise ? (
            <div className="space-y-5" aria-label="Préparation de l'exercice">
              <div className="skeleton-shimmer h-4 w-32 rounded-full" />
              <div className="skeleton-shimmer h-24 rounded-2xl" />
              <div className="skeleton-shimmer h-32 rounded-2xl" />
              <div className="skeleton-shimmer h-11 w-52 rounded-full" />
            </div>
          ) : exercise ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="rounded-full border border-violet-300/[0.14] bg-violet-300/[0.07] px-3 py-1.5 text-xs font-medium text-violet-100">
                  Exercice · {exercise.cefrLevel}
                </span>
                <span className="text-xs text-zinc-500">
                  {exercise.focus_grammar}
                </span>
              </div>

              <p className="mt-6 break-words font-serif text-xl leading-8 text-zinc-100 md:text-2xl md:leading-9">
                {exercise.french_sentence}
              </p>

              {exercise.target_vocab.length > 0 ? (
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-xs text-zinc-500">À réutiliser</span>
                  {exercise.target_vocab.map((word) => (
                    <span
                      key={word}
                      className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-xs text-zinc-300"
                    >
                      {word}
                    </span>
                  ))}
                </div>
              ) : null}

              {exercise.hint_fr ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowHint((visible) => !visible)}
                    aria-expanded={showHint}
                    className="mt-4 min-h-11 rounded-full px-3 text-sm text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-200"
                  >
                    {showHint ? "Masquer l’indice" : "Afficher un indice"}
                  </button>
                  {showHint ? (
                    <p className="mt-2 rounded-2xl border border-amber-200/[0.12] bg-amber-200/[0.04] px-4 py-3 text-sm leading-6 text-amber-100">
                      {exercise.hint_fr}
                    </p>
                  ) : null}
                </>
              ) : null}

              <label
                htmlFor="drill-translation"
                className="mt-5 block text-sm font-medium text-zinc-300"
              >
                Votre traduction en anglais
              </label>
              <textarea
                id="drill-translation"
                value={translation}
                onChange={(event) => setTranslation(event.target.value)}
                disabled={evaluation !== null || busy !== null}
                maxLength={500}
                rows={4}
                placeholder="Écrivez votre phrase en anglais…"
                className="mt-2 min-h-32 w-full resize-y rounded-2xl border border-white/[0.1] bg-black/25 px-4 py-3.5 text-base leading-7 text-zinc-100 outline-none transition focus:border-violet-200/40 focus:ring-2 focus:ring-violet-200/10 disabled:opacity-70"
              />
              <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                {microphoneSupported ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (listening) {
                        recognitionRef.current?.stop();
                      } else {
                        startDictation();
                      }
                    }}
                    disabled={evaluation !== null || busy !== null}
                    aria-pressed={listening}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/[0.09] px-3.5 text-xs text-zinc-300 transition hover:bg-white/[0.05] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-200"
                  >
                    <span aria-hidden="true">{listening ? "■" : "●"}</span>
                    {listening ? "Arrêter la dictée" : "Dicter"}
                  </button>
                ) : null}
              </div>

              <div className="mt-5 flex flex-wrap gap-2.5">
                {!evaluation ? (
                  <button
                    type="button"
                    onClick={() => void submitTranslation()}
                    disabled={!translation.trim() || busy !== null}
                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    {busy === "evaluate" ? "Évaluation…" : "Évaluer ma traduction"}
                    <span className="hidden text-xs font-normal text-zinc-600 sm:inline">
                      (Ctrl + Entrée)
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void loadExercise()}
                    disabled={busy !== null}
                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200 active:scale-[0.98] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    Phrase suivante <span aria-hidden="true" className="ml-2">→</span>
                    <span className="hidden text-xs font-normal text-zinc-600 sm:inline">
                      (Ctrl + Entrée)
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void loadExercise()}
                  disabled={busy !== null}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.035] px-4 text-sm text-zinc-200 transition hover:bg-white/[0.07] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-200"
                >
                  Nouvelle phrase
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-white/[0.07] bg-black/15 p-5 sm:p-6">
              <p className="text-sm leading-6 text-zinc-300">
                {hasProviderKey
                  ? "L’exercice n’a pas pu être préparé."
                  : "Ajoutez une clé Gemini ou OpenRouter depuis Configuration IA pour générer un exercice."}
              </p>
              <button
                type="button"
                onClick={() => void loadExercise()}
                disabled={busy !== null}
                className="mt-4 inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-medium text-zinc-950 disabled:opacity-50"
              >
                Réessayer
              </button>
            </div>
          ))}

          {error ? (
            <p
              role="alert"
              className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-300/[0.07] px-4 py-3 text-sm leading-6 text-rose-100"
            >
              {error}
            </p>
          ) : null}
        </section>

        <aside className="min-w-0 space-y-3">
          {mode === "translation" && evaluation ? (
            <section
              aria-live="polite"
              className="animate-fade-in-up min-w-0 rounded-3xl border border-white/[0.08] bg-[#111114] p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-zinc-300">
                    Votre résultat
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {evaluation.is_natural
                      ? "Une formulation naturelle"
                      : "Quelques ajustements pour gagner en naturel"}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-3.5 py-2 text-lg font-semibold tabular-nums ${scoreStyle}`}
                >
                  {evaluation.score.toLocaleString("fr-FR", {
                    minimumFractionDigits: Number.isInteger(evaluation.score) ? 0 : 1,
                    maximumFractionDigits: 1,
                  })}
                  <span className="ml-1 text-xs font-medium">/ 10</span>
                </span>
              </div>

              <div className="mt-5 border-t border-white/[0.07] pt-5">
                {evaluation.addedWords.length > 0 ? (
                  <p className="mb-4 inline-flex min-h-9 items-center rounded-full border border-emerald-300/20 bg-emerald-300/[0.07] px-3 text-xs font-medium text-emerald-100">
                    Ajouté aux révisions : {evaluation.addedWords.join(", ")}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-500">Traduction de référence</p>
                    <p className="mt-2 break-words font-serif text-lg leading-7 text-white">
                      {evaluation.ideal_translation}
                    </p>
                  </div>
                  <AudioPlayerBar
                    className="max-w-full"
                    mode="compact"
                    engine={speechEngine}
                    text={evaluation.ideal_translation}
                    sourceId={`drill:${exercise?.french_sentence}:reference`}
                  />
                </div>
                <p className="mt-4 text-xs text-zinc-500">Autre formulation</p>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                  <p className="min-w-0 flex-1 break-words text-sm leading-6 text-zinc-300">
                    {evaluation.alternative_translation}
                  </p>
                  <AudioPlayerBar
                    className="max-w-full"
                    mode="compact"
                    engine={speechEngine}
                    text={evaluation.alternative_translation}
                    sourceId={`drill:${exercise?.french_sentence}:alternative`}
                  />
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-violet-200/[0.1] bg-violet-200/[0.04] p-4">
                <p className="text-sm font-medium text-violet-100">
                  À retenir
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                  {evaluation.feedback_fr}
                </p>
              </div>

              <div className="mt-5">
                <p className="text-sm font-medium text-zinc-200">
                  Points corrigés
                </p>
                {evaluation.detected_mistakes.length > 0 ? (
                  <ul className="mt-3 space-y-2.5">
                    {evaluation.detected_mistakes.map((mistake, index) => (
                      <li
                        key={`${mistake.user_fragment}-${index}`}
                        className="rounded-2xl border border-white/[0.06] bg-black/20 p-3.5"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="break-words text-sm text-rose-200 line-through">
                            {mistake.user_fragment}
                          </span>
                          <span aria-hidden="true" className="text-zinc-600">→</span>
                          <span className="break-words text-sm text-emerald-200">
                            {mistake.correction}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-amber-100">
                          {mistake.category}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-zinc-400">
                          {mistake.explanation}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-emerald-200">
                    Aucune erreur à enregistrer. Belle traduction !
                  </p>
                )}
              </div>
              <p className="mt-4 text-xs text-zinc-500">
                {evaluation.detected_mistakes.length
                  ? "Ces points sont enregistrés dans vos points de vigilance."
                  : "Aucune erreur récurrente n’a été ajoutée."}
              </p>
            </section>
          ) : null}

          <section className="min-w-0 rounded-3xl border border-white/[0.08] bg-[#111114] p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Mes points de vigilance
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Les erreurs gardées pour mieux les reconnaître.
                </p>
              </div>
              <span className="rounded-full border border-white/[0.07] px-2.5 py-1 text-xs tabular-nums text-zinc-400">
                {mistakeSummary.totalCount}
              </span>
            </div>
            {mistakeSummary.categories.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {mistakeSummary.categories.map((category) => (
                  <span
                    key={category.category}
                    className="rounded-full border border-amber-200/[0.1] bg-amber-200/[0.04] px-2.5 py-1 text-xs text-amber-100"
                  >
                    {category.category} · {category.count}
                  </span>
                ))}
              </div>
            ) : null}
            <MistakeList mistakes={mistakeSummary.mistakes} />
          </section>
        </aside>
      </div>
    </main>
  );
}
