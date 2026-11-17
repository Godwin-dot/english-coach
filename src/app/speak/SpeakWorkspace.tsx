"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AudioPlayerBar } from "@/components/AudioPlayerBar";
import { useSpeechEngine } from "@/hooks/useSpeechEngine";
import {
  useSpeechRecognition,
  type STTMode,
} from "@/hooks/useSpeechRecognition";
import {
  PronunciationExerciseSchema,
  PronunciationFocusSchema,
  type PronunciationExercise,
  type PronunciationFocus,
} from "@/schemas/speak";
import type { CEFRLevel } from "@/schemas/lesson";
import {
  evaluateDictation,
  type DictationEvaluation,
  type DictationToken,
} from "@/lib/dictationDiff";

type TrainingMode = "shadowing" | "free";
type PendingPlayback = { text: string; sourceId: string };

const focusOptions: Array<{ value: PronunciationFocus; label: string }> = [
  { value: "general", label: "Fluidité générale" },
  { value: "th-sounds", label: "Sons « th »" },
  { value: "contractions", label: "Contractions" },
  { value: "vowels", label: "Voyelles" },
  { value: "tech-pitch", label: "Présentation professionnelle" },
];

const cefrLevels: CEFRLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

function getErrorMessage(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }
  return "La requête n’a pas abouti.";
}

function countWords(text: string): number {
  return (
    text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0
  );
}

function DictationDiff({ result }: { result: DictationEvaluation }) {
  const styles: Record<DictationToken["type"], string> = {
    correct: "border-emerald-500/15 bg-emerald-500/10 text-emerald-300",
    substitution: "border-amber-400/20 bg-amber-400/[0.08] text-amber-200",
    missing: "border-rose-400/20 bg-rose-400/[0.07] text-rose-200",
    extra: "border-zinc-500/20 bg-zinc-500/[0.08] text-zinc-300",
  };

  return (
    <div
      aria-label="Comparaison mot à mot"
      className="mt-4 flex flex-wrap gap-2"
    >
      {result.tokens.map((token, index) => {
        const label =
          token.type === "correct"
            ? token.expected
            : token.type === "substitution"
              ? `${token.actual} → ${token.expected}`
              : token.type === "missing"
                ? `[${token.expected}]`
                : `+ ${token.actual}`;
        return (
          <span
            key={`${token.type}-${index}`}
            className={`max-w-full break-words rounded-lg border px-2.5 py-1.5 text-sm ${styles[token.type]}`}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

function EngineStatus({ status }: { status: string }) {
  const labels: Record<string, string> = {
    unloaded: "Modèle non chargé",
    loading: "Chargement",
    ready: "Prêt",
    error: "Indisponible",
  };
  const indicator =
    status === "ready"
      ? "bg-emerald-400"
      : status === "loading"
        ? "bg-[#FBBF24]"
        : "bg-zinc-500";
  return (
    <span className="inline-flex items-center gap-2 text-xs text-zinc-400">
      <span aria-hidden="true" className={`size-1.5 rounded-full ${indicator}`} />
      {labels[status] ?? status}
    </span>
  );
}

export function SpeakWorkspace({ cefrLevel }: { cefrLevel: CEFRLevel }) {
  const [trainingMode, setTrainingMode] = useState<TrainingMode>("shadowing");
  const [selectedLevel, setSelectedLevel] = useState(cefrLevel);
  const [focus, setFocus] = useState<PronunciationFocus>("general");
  const [exercise, setExercise] = useState<PronunciationExercise | null>(null);
  const [evaluation, setEvaluation] = useState<DictationEvaluation | null>(null);
  const [busy, setBusy] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [error, setError] = useState("");
  const pendingPlaybackRef = useRef<PendingPlayback | null>(null);
  const recordedAttemptRef = useRef("");
  const speechEngine = useSpeechEngine();
  const recognition = useSpeechRecognition();

  const playWithStudio = useCallback(
    (text: string, sourceId: string, rate: 1 | 0.75 = 1) => {
      if (!text.trim()) return;
      speechEngine.stop();
      speechEngine.setRate(rate);
      if (speechEngine.kokoroStatus === "ready") {
        speechEngine.setEngineMode("kokoro");
        speechEngine.speak(text, sourceId);
      } else {
        pendingPlaybackRef.current = { text, sourceId };
        speechEngine.setEngineMode("kokoro");
      }
    },
    [speechEngine],
  );

  useEffect(() => {
    speechEngine.setEngineMode("kokoro");
  }, [speechEngine.setEngineMode]);

  useEffect(() => {
    const pending = pendingPlaybackRef.current;
    if (pending && speechEngine.kokoroStatus === "ready") {
      pendingPlaybackRef.current = null;
      speechEngine.speak(pending.text, pending.sourceId);
    } else if (
      pending &&
      speechEngine.kokoroStatus === "error"
    ) {
      pendingPlaybackRef.current = null;
      setError(
        "Kokoro Studio (Local) est indisponible. Réessayez son chargement depuis les réglages audio.",
      );
    }
  }, [speechEngine.kokoroStatus, speechEngine.speak]);

  const generateExercise = useCallback(async () => {
    setBusy(true);
    setError("");
    setEvaluation(null);
    setShowHint(false);
    recordedAttemptRef.current = "";
    recognition.clearTranscript();
    speechEngine.stop();
    pendingPlaybackRef.current = null;
    try {
      const response = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          cefrLevel: selectedLevel,
          focus,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(body));
      if (
        typeof body !== "object" ||
        body === null ||
        !("exercise" in body)
      ) {
        throw new Error("La réponse de l’exercice est invalide.");
      }
      const parsed = PronunciationExerciseSchema.safeParse(body.exercise);
      if (!parsed.success) {
        throw new Error("L’exercice reçu ne respecte pas le format attendu.");
      }
      setExercise(parsed.data);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible de préparer un exercice.",
      );
    } finally {
      setBusy(false);
    }
  }, [
    focus,
    recognition.clearTranscript,
    selectedLevel,
    speechEngine.stop,
  ]);

  useEffect(() => {
    if (
      trainingMode !== "shadowing" ||
      !exercise ||
      recognition.listening ||
      recognition.isTranscribing ||
      !recognition.transcript.trim() ||
      recordedAttemptRef.current === recognition.transcript
    ) {
      return;
    }

    const spokenText = recognition.transcript.trim();
    recordedAttemptRef.current = spokenText;
    const result = evaluateDictation(exercise.sentence_en, spokenText);
    setEvaluation(result);
    setError("");
    void fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "record",
        sentenceEn: exercise.sentence_en,
        spokenText,
        accuracyPct: result.accuracyPct,
      }),
    })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) throw new Error(getErrorMessage(body));
      })
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error
            ? `La tentative n’a pas pu être enregistrée : ${caught.message}`
            : "La tentative n’a pas pu être enregistrée.",
        );
      });
  }, [
    exercise,
    recognition.isTranscribing,
    recognition.listening,
    recognition.transcript,
    trainingMode,
  ]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        event.key.toLowerCase() === "r" &&
        exercise
      ) {
        event.preventDefault();
        playWithStudio(exercise.sentence_en, "pronunciation:sentence");
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [exercise, playWithStudio]);

  const selectedMode = (mode: TrainingMode) => {
    setTrainingMode(mode);
    setError("");
    recognition.clearTranscript();
    setEvaluation(null);
  };

  const selectSttMode = (mode: STTMode) => {
    recognition.setSttMode(mode);
  };

  const transcript = recognition.transcript || recognition.interimTranscript;
  const hasAttempt = Boolean(recognition.transcript.trim());
  const recognitionBusy =
    recognition.isStarting ||
    recognition.listening ||
    recognition.isTranscribing;

  return (
    <main className="mx-auto w-full max-w-6xl min-w-0 px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-10">
      <div className="mb-6 flex min-w-0 flex-col gap-5 md:mb-8 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-zinc-400">Niveau ciblé : {selectedLevel}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#EDEDED] sm:text-3xl">
            Prononciation
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Écoutez une voix Studio, entraînez votre articulation et voyez
            précisément ce que Whisper a entendu.
          </p>
        </div>
        <div className="w-full min-w-0 md:max-w-[460px]">
          <AudioPlayerBar compact engine={speechEngine} />
        </div>
      </div>

      <section
        aria-label="Moteur de reconnaissance vocale"
        className="mb-5 grid min-w-0 gap-4 rounded-2xl border border-white/[0.08] bg-[#0A0A0A] p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-sm font-semibold text-zinc-100">
              Reconnaissance vocale
            </h2>
            {recognition.sttMode === "whisper" ? (
              <EngineStatus status={recognition.whisperStatus} />
            ) : (
              <span className="text-xs text-zinc-400">
                Transcription en direct dans le navigateur
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            {recognition.sttMode === "whisper"
              ? "Whisper transcrit sur le serveur, sans clé API. Le premier chargement récupère le modèle."
              : "La transcription s’affiche en direct avec la reconnaissance vocale native."}
          </p>
        </div>
        <div
          role="group"
          aria-label="Choisir le moteur de reconnaissance"
          className="grid min-w-0 grid-cols-2 gap-1 rounded-xl border border-white/[0.08] bg-[#000000] p-1"
        >
          <button
            type="button"
            aria-pressed={recognition.sttMode === "whisper"}
            onClick={() => selectSttMode("whisper")}
            disabled={recognitionBusy}
            className={`min-h-11 min-w-0 rounded-lg px-2 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:px-3 ${
              recognition.sttMode === "whisper"
                ? "bg-[#171717] text-[#EDEDED]"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <span className="block truncate">Whisper Studio (Local)</span>
            <span className="block truncate text-[10px] text-zinc-500">
              Défaut
            </span>
          </button>
          <button
            type="button"
            aria-pressed={recognition.sttMode === "browser"}
            onClick={() => selectSttMode("browser")}
            disabled={
              !recognition.browserSupported ||
              recognitionBusy
            }
            className={`min-h-11 min-w-0 rounded-lg px-2 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 ${
              recognition.sttMode === "browser"
                ? "bg-[#171717] text-[#EDEDED]"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Navigateur
          </button>
        </div>
        {recognition.sttMode === "whisper" &&
        recognition.whisperStatus !== "ready" ? (
          <div className="flex min-w-0 flex-wrap items-center gap-3 md:col-span-2">
            <button
              type="button"
              onClick={() => void recognition.warmupWhisper()}
              disabled={recognition.whisperStatus === "loading"}
              className="min-h-10 rounded-full border border-white/[0.12] bg-[#0A0A0A] px-4 text-xs font-medium text-zinc-100 transition-colors duration-150 hover:border-white/[0.22] hover:bg-[#141414] disabled:cursor-wait disabled:opacity-60"
            >
              {recognition.whisperStatus === "loading"
                ? "Chargement en cours…"
                : "Précharger Whisper Studio (Local)"}
            </button>
            <span className="text-xs leading-5 text-zinc-500">
              Le modèle est téléchargé une seule fois puis conservé en cache.
            </span>
          </div>
        ) : null}
      </section>

      <div
        role="tablist"
        aria-label="Mode d’entraînement"
        className="mb-5 flex w-full max-w-md rounded-xl border border-white/[0.08] bg-[#0A0A0A] p-1"
      >
        {(
          [
            ["shadowing", "Répéter la phrase"],
            ["free", "Expression libre"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={trainingMode === mode}
            onClick={() => selectedMode(mode)}
            disabled={recognitionBusy}
            className={`min-h-11 min-w-0 flex-1 rounded-lg px-3 text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 ${
              trainingMode === mode
                ? "bg-[#171717] font-medium text-[#EDEDED]"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {trainingMode === "shadowing" ? (
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <section className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#0A0A0A] p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-zinc-500">Répétition évaluée</p>
                <h2 className="mt-1 font-serif text-xl text-white">
                  Écoutez. Répétez. Comparez.
                </h2>
              </div>
              {exercise ? (
                <span className="rounded-full border border-amber-300/15 bg-amber-300/[0.06] px-3 py-1 text-xs text-amber-100">
                  {selectedLevel} · {focusOptions.find((option) => option.value === focus)?.label}
                </span>
              ) : null}
            </div>

            <div className="mt-5 min-w-0 rounded-2xl border border-white/[0.07] bg-black/20 p-4 sm:p-5">
              {exercise ? (
                <>
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-zinc-500">
                        Phrase modèle · masquée pendant l’écoute
                      </p>
                      <p className="mt-2 break-words font-serif text-lg leading-7 text-white">
                        {evaluation ? exercise.sentence_en : "••••••••••••••••••••"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowHint((visible) => !visible);
                      }}
                      aria-expanded={showHint}
                      className="min-h-10 shrink-0 rounded-full border border-white/[0.1] px-3 text-xs text-zinc-300 transition hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
                    >
                      {showHint ? "Masquer l’indice" : "Indice"}
                    </button>
                  </div>
                  {showHint ? (
                    <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-3">
                      <p className="text-xs text-zinc-400">
                        <span className="tabular-nums">
                          {countWords(exercise.sentence_en)}
                        </span>{" "}
                        mots · Sens en français
                      </p>
                      <p className="mt-1 break-words text-sm leading-6 text-zinc-200">
                        {exercise.translation_fr}
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        playWithStudio(exercise.sentence_en, "pronunciation:sentence", 1)
                      }
                      className="min-h-11 rounded-full bg-white px-4 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
                    >
                      Écouter la phrase <span className="tabular-nums">1x</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        playWithStudio(exercise.sentence_en, "pronunciation:sentence-slow", 0.75)
                      }
                      className="min-h-11 rounded-full border border-white/[0.1] px-4 text-sm text-zinc-200 transition hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
                    >
                      Écouter au ralenti <span className="tabular-nums">0.75x</span>
                    </button>
                    <span className="inline-flex min-h-11 items-center rounded-full px-3 text-xs text-zinc-500">
                      Raccourci : <kbd className="ml-1 rounded border border-white/[0.1] px-1.5 py-0.5 text-zinc-300">Alt + R</kbd>
                    </span>
                  </div>
                  {speechEngine.kokoroStatus === "error" ? (
                    <p className="mt-3 text-xs leading-5 text-amber-200">
                      Kokoro Studio (Local) est indisponible. Réessayez depuis la barre de réglages audio.
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="py-5 text-center">
                  <p className="font-serif text-lg text-white">
                    Une phrase, puis votre propre voix.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    Choisissez un niveau et un axe d’articulation pour préparer un exercice.
                  </p>
                </div>
              )}
            </div>

            {exercise ? (
              <div className="mt-4 rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-zinc-100">
                      Votre prononciation
                    </h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      {recognition.isStarting
                        ? "Connexion au microphone…"
                        : recognition.listening
                          ? "Enregistrement en cours…"
                          : recognition.isTranscribing
                            ? "Whisper analyse votre voix…"
                            : "Enregistrez, puis arrêtez pour afficher la comparaison."}
                    </p>
                  </div>
                  {recognition.listening ? (
                    <button
                      type="button"
                      onClick={() => void recognition.stopListening()}
                      className="min-h-11 rounded-full border border-rose-300/20 bg-rose-300/[0.08] px-4 text-sm font-medium text-rose-100 transition hover:bg-rose-300/[0.13]"
                    >
                      Arrêter
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void recognition.startListening()}
                      disabled={recognitionBusy || busy}
                      className="min-h-11 rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-4 text-sm font-medium text-emerald-100 transition hover:bg-emerald-300/[0.13] disabled:cursor-wait disabled:opacity-50"
                    >
                      {recognition.isStarting
                        ? "Connexion au microphone…"
                        : recognition.isTranscribing
                          ? "Transcription…"
                          : hasAttempt
                            ? "Recommencer l’enregistrement"
                            : "Enregistrer ma voix"}
                    </button>
                  )}
                </div>
                <div
                  aria-live="polite"
                  className="mt-3 min-h-12 break-words rounded-xl border border-white/[0.05] bg-white/[0.025] px-3 py-3 text-sm leading-6 text-zinc-300"
                >
                  {transcript || (
                    <span className="text-zinc-600">
                      Votre transcription s’affichera ici.
                    </span>
                  )}
                </div>
              </div>
            ) : null}

            {evaluation && exercise ? (
              <div className="mt-4 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.035] p-4 sm:p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs text-zinc-400">Précision</p>
                    <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-white">
                      {evaluation.accuracyPct.toFixed(1)}
                      <span className="text-lg text-zinc-400"> %</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      playWithStudio(exercise.sentence_en, "pronunciation:review")
                    }
                    className="min-h-10 rounded-full border border-white/[0.1] px-3 text-xs text-zinc-200 transition hover:bg-white/[0.06]"
                  >
                    Réécouter la phrase
                  </button>
                </div>
                <DictationDiff result={evaluation} />
                <div className="mt-4 border-t border-white/[0.07] pt-3">
                  <p className="text-sm font-medium text-zinc-100">
                    {exercise.sentence_en}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-zinc-400">
                    {exercise.translation_fr}
                  </p>
                  <p className="mt-3 text-xs leading-5 text-amber-100/80">
                    {exercise.phonetic_tip_fr}
                  </p>
                </div>
              </div>
            ) : null}
          </section>

          <aside className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#0A0A0A] p-4 sm:p-5">
            <div>
              <p className="text-xs text-zinc-500">Paramètres de l’exercice</p>
              <h2 className="mt-1 font-serif text-xl text-white">
                Choisissez votre cible
              </h2>
            </div>
            <label className="mt-5 block text-xs text-zinc-400">
              Niveau CECRL
              <select
                value={selectedLevel}
                onChange={(event) =>
                  setSelectedLevel(event.target.value as CEFRLevel)
                }
                className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.08] bg-[#0b0b0e] px-3 text-sm text-zinc-100 outline-none focus:border-amber-200/40"
              >
                {cefrLevels.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block text-xs text-zinc-400">
              Axe d’articulation
              <select
                value={focus}
                onChange={(event) => {
                  const parsed = PronunciationFocusSchema.safeParse(event.target.value);
                  if (parsed.success) setFocus(parsed.data);
                }}
                className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.08] bg-[#0b0b0e] px-3 text-sm text-zinc-100 outline-none focus:border-amber-200/40"
              >
                {focusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void generateExercise()}
              disabled={busy || recognitionBusy}
              className="mt-5 min-h-11 w-full rounded-full bg-amber-200 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-amber-100 disabled:cursor-wait disabled:opacity-50"
            >
              {busy
                ? "Préparation…"
                : exercise
                  ? "Phrase suivante"
                  : "Préparer une phrase"}
            </button>

            <div className="mt-5 rounded-xl border border-white/[0.06] bg-black/20 p-3.5">
              <p className="text-xs font-medium text-zinc-200">
                Repère d’articulation
              </p>
              <p className="mt-1 text-xs leading-5 text-zinc-400">
                {exercise
                  ? exercise.phonetic_tip_fr
                  : "Chaque phrase inclut un conseil bref et un ou plusieurs sons à travailler."}
              </p>
              {exercise ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {exercise.target_sounds.map((sound) => (
                    <span
                      key={sound}
                      className="rounded-full border border-white/[0.07] px-2.5 py-1 text-[11px] text-zinc-300"
                    >
                      {sound}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      ) : (
        <section className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.62fr)]">
          <div className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#0A0A0A] p-4 sm:p-6">
            <p className="text-xs text-zinc-500">Conversation ouverte</p>
            <h2 className="mt-1 font-serif text-2xl text-white">
              Parlez librement en anglais.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Décrivez une idée, racontez votre journée ou improvisez. Whisper
              transcrit votre voix localement ; vous pourrez ensuite entendre
              votre phrase avec la voix Kokoro Studio (Local).
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {recognition.listening ? (
                <button
                  type="button"
                  onClick={() => void recognition.stopListening()}
                  className="min-h-11 rounded-full border border-rose-300/20 bg-rose-300/[0.08] px-4 text-sm font-medium text-rose-100 transition hover:bg-rose-300/[0.13]"
                >
                  Arrêter l’enregistrement
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void recognition.startListening()}
                  disabled={recognitionBusy}
                  className="min-h-11 rounded-full bg-white px-4 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-wait disabled:opacity-50"
                >
                  {recognition.isStarting
                    ? "Connexion au microphone…"
                    : recognition.isTranscribing
                      ? "Transcription…"
                      : "Commencer à parler"}
                </button>
              )}
              {recognition.transcript.trim() ? (
                <button
                  type="button"
                  onClick={() =>
                    playWithStudio(
                      recognition.transcript,
                      "pronunciation:free-comparison",
                    )
                  }
                  className="min-h-11 rounded-full border border-amber-200/20 bg-amber-200/[0.07] px-4 text-sm font-medium text-amber-100 transition hover:bg-amber-200/[0.12]"
                >
                  Comparer avec la voix Kokoro Studio (Local)
                </button>
              ) : null}
            </div>
            <div
              aria-live="polite"
              className="mt-5 min-h-32 min-w-0 whitespace-pre-wrap break-words rounded-2xl border border-white/[0.07] bg-black/20 p-4 text-sm leading-7 text-zinc-200"
            >
              {transcript || (
                <span className="text-zinc-600">
                  Votre transcription apparaîtra ici.
                </span>
              )}
            </div>
            {recognition.transcript ? (
              <button
                type="button"
                onClick={recognition.clearTranscript}
                className="mt-3 min-h-10 rounded-full px-3 text-xs text-zinc-400 transition hover:bg-white/[0.05] hover:text-white"
              >
                Effacer la transcription
              </button>
            ) : null}
          </div>
          <aside className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#0A0A0A] p-4 sm:p-5">
            <p className="text-xs text-zinc-500">Voix de référence</p>
            <h2 className="mt-1 font-serif text-xl text-white">
              Réécoutez votre phrase
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              La comparaison utilise Kokoro Studio (Local) quand son modèle
              local est prêt. Vous pouvez ajuster la vitesse et la voix dans la
              barre audio en haut de page.
            </p>
            <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3">
              <span className="text-xs text-zinc-300">Kokoro Studio (Local)</span>
              <EngineStatus status={speechEngine.kokoroStatus} />
            </div>
            {speechEngine.kokoroStatus !== "ready" ? (
              <button
                type="button"
                onClick={speechEngine.initKokoroModel}
                disabled={speechEngine.kokoroStatus === "loading"}
                className="mt-3 min-h-10 w-full rounded-full border border-white/[0.1] px-4 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.06] disabled:cursor-wait disabled:opacity-50"
              >
                {speechEngine.kokoroStatus === "loading"
                  ? "Chargement de la voix…"
                  : "Charger Kokoro Studio (Local)"}
              </button>
            ) : null}
          </aside>
        </section>
      )}

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-sm leading-6 text-rose-100"
        >
          {error}
        </p>
      ) : null}
      {recognition.error ? (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-sm leading-6 text-rose-100"
        >
          {recognition.error}
        </p>
      ) : null}
    </main>
  );
}
