"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MistakeCategoryCount,
  RecentMistake,
  RecentMistakes,
} from "@/domain/drill";
import type {
  DrillEvaluationResult,
  GeneratedDrillPrompt,
} from "@/schemas/drill";
import type { CEFRLevel } from "@/schemas/lesson";

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

function speak(text: string): void {
  if (!("speechSynthesis" in window)) {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  window.speechSynthesis.speak(utterance);
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
  const [exercise, setExercise] = useState<DrillExercise | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<CEFRLevel>(cefrLevel);
  const [topic, setTopic] = useState("");
  const [translation, setTranslation] = useState("");
  const [evaluation, setEvaluation] = useState<DrillEvaluation | null>(null);
  const [mistakeSummary, setMistakeSummary] = useState(initialMistakes);
  const [busy, setBusy] = useState<"generate" | "evaluate" | null>(null);
  const [error, setError] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [microphoneSupported, setMicrophoneSupported] = useState(false);
  const [listening, setListening] = useState(false);
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

  useEffect(() => {
    void loadExercise(retrySentence);
    // Load once from the URL; later settings changes only affect the next request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retrySentence]);

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
      window.speechSynthesis?.cancel();
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

  return (
    <main className="mx-auto max-w-6xl px-4 pb-10 pt-6 sm:px-7 sm:pt-9">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-400">Pratiquez la production active</p>
          <h1 className="mt-1 font-serif text-3xl tracking-[-0.04em] text-white sm:text-4xl">
            Traduction française → anglaise
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Une phrase à la fois, à votre niveau. Vos mots appris et vos
            erreurs récentes orientent les exercices.
          </p>
        </div>
        <div className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3.5 py-2 text-xs text-zinc-300">
          {mistakeSummary.totalCount} point
          {mistakeSummary.totalCount === 1 ? "" : "s"} de vigilance
        </div>
      </header>

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
          onClick={() => void loadExercise()}
          disabled={busy !== null}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200 active:scale-[0.98] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {busy === "generate" ? "Génération…" : "Générer une phrase"}
        </button>
      </section>

      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.75fr)]">
        <section className="min-w-0 rounded-3xl border border-white/[0.08] bg-[#111114] p-5 sm:p-7">
          {busy === "generate" && !exercise ? (
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
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                    event.preventDefault();
                    void submitTranslation();
                  }
                }}
                disabled={evaluation !== null || busy !== null}
                maxLength={500}
                rows={4}
                placeholder="Écrivez votre phrase en anglais…"
                className="mt-2 min-h-32 w-full resize-y rounded-2xl border border-white/[0.1] bg-black/25 px-4 py-3.5 text-base leading-7 text-zinc-100 outline-none transition focus:border-violet-200/40 focus:ring-2 focus:ring-violet-200/10 disabled:opacity-70"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-zinc-500">
                  Ctrl + Entrée ou ⌘ + Entrée pour évaluer
                </p>
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
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void loadExercise()}
                    disabled={busy !== null}
                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200 active:scale-[0.98] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    Phrase suivante <span aria-hidden="true" className="ml-2">→</span>
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
          )}

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
          {evaluation ? (
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
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-500">Traduction de référence</p>
                    <p className="mt-2 break-words font-serif text-lg leading-7 text-white">
                      {evaluation.ideal_translation}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => speak(evaluation.ideal_translation)}
                    aria-label="Écouter la traduction de référence"
                    className="grid size-11 shrink-0 place-items-center rounded-full border border-white/[0.09] text-zinc-200 transition hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-200"
                  >
                    <span aria-hidden="true">▶</span>
                  </button>
                </div>
                <p className="mt-4 text-xs text-zinc-500">Autre formulation</p>
                <p className="mt-1 break-words text-sm leading-6 text-zinc-300">
                  {evaluation.alternative_translation}
                </p>
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
