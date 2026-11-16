"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DiscoveryCard, ReviewCardView } from "@/domain/cards";
import type { LessonView } from "@/domain/lessons";
import type {
  DrillEvaluationResult,
  GeneratedDrillPrompt,
} from "@/schemas/drill";
import type { CEFRLevel, KeywordItem } from "@/schemas/lesson";
import type { ReviewRating } from "@/srs";

type ReviewItem =
  | { kind: "due"; key: string; card: ReviewCardView }
  | { kind: "discovery"; key: string; card: DiscoveryCard };

type SessionDrill = GeneratedDrillPrompt & {
  cefrLevel: CEFRLevel;
  topic: string | null;
};

type SessionEvaluation = DrillEvaluationResult & {
  addedWords?: string[];
};

function errorMessage(body: unknown): string {
  return typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
    ? body.error
    : "La requête n’a pas abouti.";
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(body));
  return body as T;
}

function makeQueueItem(card: DiscoveryCard): ReviewItem {
  return { kind: "discovery", key: `discovery-${card.discoveryId}`, card };
}

function RatingButtons({
  onRate,
  disabled,
}: {
  onRate: (rating: ReviewRating) => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {(
        [
          [1, "À revoir", "text-rose-100 border-rose-300/20"],
          [2, "Difficile", "text-amber-100 border-amber-300/20"],
          [3, "Bien", "text-emerald-100 border-emerald-300/20"],
          [4, "Facile", "text-violet-100 border-violet-300/20"],
        ] as const
      ).map(([rating, label, colors]) => (
        <button
          key={rating}
          type="button"
          disabled={disabled}
          onClick={() => onRate(rating)}
          className={`min-h-11 rounded-full border bg-white/[0.035] px-3 text-sm transition hover:bg-white/[0.08] disabled:cursor-wait disabled:opacity-50 ${colors}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function SessionWorkspace({
  cefrLevel,
  interests,
  initialDueCards,
  initialLesson,
}: {
  cefrLevel: CEFRLevel;
  interests: string[];
  initialDueCards: ReviewCardView[];
  initialLesson: LessonView | null;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [queue, setQueue] = useState<ReviewItem[]>(
    initialDueCards.map((card) => ({
      kind: "due",
      key: `due-${card.id}`,
      card,
    })),
  );
  const [lesson, setLesson] = useState<LessonView | null>(initialLesson);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [drills, setDrills] = useState<SessionDrill[]>([]);
  const [drillsLoading, setDrillsLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [addedWords, setAddedWords] = useState<string[]>([]);
  const [answers, setAnswers] = useState<number[]>([]);
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [quizBusy, setQuizBusy] = useState(false);
  const [cardStatuses, setCardStatuses] = useState<Record<string, string>>({});
  const [translations, setTranslations] = useState(["", ""]);
  const [evaluations, setEvaluations] = useState<(SessionEvaluation | null)[]>([
    null,
    null,
  ]);
  const [evaluationBusy, setEvaluationBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const sessionStartedAt = useRef(Date.now());
  const discoveryRequested = useRef(false);
  const lessonRequested = useRef(false);
  const drillsRequested = useRef(false);
  const currentItem = queue[0] ?? null;
  const discoveryMode = initialDueCards.length === 0;
  const currentWord =
    currentItem?.kind === "discovery"
      ? currentItem.card.term
      : currentItem?.card.term;
  const allQuizQuestionsAnswered = Boolean(
    lesson &&
      lesson.quiz.every((_, index) => Number.isInteger(answers[index])),
  );

  const loadDiscovery = useCallback(async () => {
    if (discoveryRequested.current || discoveryLoading) return;
    discoveryRequested.current = true;
    setDiscoveryLoading(true);
    setError("");
    try {
      const batch = await requestJson<{ cards: DiscoveryCard[] }>(
        "/api/review/discover",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: 4 }),
        },
      );
      setQueue(batch.cards.map(makeQueueItem));
    } catch (caught) {
      discoveryRequested.current = false;
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible de préparer les mots de découverte.",
      );
    } finally {
      setDiscoveryLoading(false);
    }
  }, [discoveryLoading]);

  const loadLesson = useCallback(async () => {
    if (lesson || lessonRequested.current) return;
    lessonRequested.current = true;
    setLessonLoading(true);
    setError("");
    try {
      const topic = interests[0] ?? "English for everyday life";
      const generated = await requestJson<LessonView>("/api/lessons/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, cefrLevel }),
      });
      setLesson(generated);
    } catch (caught) {
      lessonRequested.current = false;
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible de préparer la micro-leçon.",
      );
    } finally {
      setLessonLoading(false);
    }
  }, [cefrLevel, interests, lesson]);

  const loadDrills = useCallback(async () => {
    if (drillsRequested.current) return;
    drillsRequested.current = true;
    setDrillsLoading(true);
    setError("");
    try {
      const vocab = lesson?.keywords.map((word) => word.term).slice(0, 3) ?? [];
      const topic = vocab.length
        ? `Use these English words naturally: ${vocab.join(", ")}`
        : interests[0] ?? "everyday English";
      const generated = await Promise.all(
        [0, 1].map(() =>
          requestJson<SessionDrill>("/api/drill/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topic, cefrLevel }),
          }),
        ),
      );
      setDrills(generated);
    } catch (caught) {
      drillsRequested.current = false;
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible de préparer les phrases à traduire.",
      );
    } finally {
      setDrillsLoading(false);
    }
  }, [cefrLevel, interests, lesson]);

  useEffect(() => {
    if (discoveryMode) void loadDiscovery();
  }, [discoveryMode, loadDiscovery]);

  useEffect(() => {
    if (step === 2 && !lesson) void loadLesson();
  }, [lesson, loadLesson, step]);

  useEffect(() => {
    if (step === 3 && drills.length === 0) void loadDrills();
  }, [drills.length, loadDrills, step]);

  useEffect(() => {
    setRevealed(false);
  }, [currentItem?.key]);

  async function rateCurrentCard(rating: ReviewRating) {
    if (!currentItem || reviewBusy) return;
    setReviewBusy(true);
    setError("");
    try {
      const durationS = Math.max(
        0,
        Math.floor((Date.now() - sessionStartedAt.current) / 1000),
      );
      const body =
        currentItem.kind === "due"
          ? {
              cardId: currentItem.card.id,
              rating,
              duration_s: durationS,
              mode: "due",
            }
          : {
              discoveryCard: {
                term: currentItem.card.term,
                translation: currentItem.card.translation,
                part_of_speech: currentItem.card.part_of_speech,
                example_sentence: currentItem.card.example_sentence,
                example_translation: currentItem.card.example_translation,
                mnemonic: currentItem.card.mnemonic,
              },
              rating,
              duration_s: durationS,
            };
      const result = await requestJson<{ status?: string }>(
        "/api/review",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (currentItem.kind === "due") {
        setReviewedCount((count) => count + 1);
      } else if (result.status === "created") {
        setAddedWords((words) => [...words, currentItem.card.term]);
      }
      setQueue((items) => items.slice(1));
      if (queue.length === 1) {
        setStep(2);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "La révision n’a pas pu être enregistrée.",
      );
    } finally {
      setReviewBusy(false);
    }
  }

  async function addKeyword(keyword: KeywordItem) {
    if (!lesson) return;
    setCardStatuses((current) => ({ ...current, [keyword.term]: "busy" }));
    setError("");
    try {
      const result = await requestJson<{
        status: "created" | "already_exists" | "daily_cap_reached";
      }>("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          term: keyword.term,
          translation: keyword.translation,
          phonetic: keyword.phonetic,
          example_sentence: keyword.example,
          example_translation: keyword.example_fr,
          source_lesson_id: lesson.id,
        }),
      });
      const statusText = {
        created: "Ajouté au deck",
        already_exists: "Déjà dans le deck",
        daily_cap_reached: "Plafond quotidien atteint",
      }[result.status];
      setCardStatuses((current) => ({ ...current, [keyword.term]: statusText }));
      if (result.status === "created") {
        setAddedWords((words) => [...words, keyword.term]);
      }
    } catch (caught) {
      setCardStatuses((current) => {
        const next = { ...current };
        delete next[keyword.term];
        return next;
      });
      setError(
        caught instanceof Error
          ? caught.message
          : "Ce mot n’a pas pu être ajouté.",
      );
    }
  }

  async function submitQuiz() {
    if (!lesson || quizBusy || !allQuizQuestionsAnswered) return;
    const correct = lesson.quiz.reduce(
      (total, question, index) =>
        total + (answers[index] === question.answer_index ? 1 : 0),
      0,
    );
    const score = Number(((correct / lesson.quiz.length) * 10).toFixed(1));
    setQuizBusy(true);
    setError("");
    try {
      await requestJson<{ completedAt: string }>(
        `/api/lessons/${lesson.id}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ score }),
        },
      );
      setQuizScore(score);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Le résultat du QCM n’a pas pu être enregistré.",
      );
    } finally {
      setQuizBusy(false);
    }
  }

  async function evaluateTranslation(index: number) {
    const drill = drills[index];
    const userTranslation = translations[index].trim();
    if (!drill || !userTranslation || evaluationBusy !== null) return;
    setEvaluationBusy(index);
    setError("");
    try {
      const result = await requestJson<SessionEvaluation>(
        "/api/drill/evaluate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            frenchSentence: drill.french_sentence,
            userTranslation,
            targetVocab: drill.target_vocab,
            cefrLevel: drill.cefrLevel,
            duration_s: Math.max(
              0,
              Math.floor((Date.now() - sessionStartedAt.current) / 1000),
            ),
          }),
        },
      );
      setEvaluations((current) => {
        const next = [...current];
        next[index] = result;
        return next;
      });
      setAddedWords((words) => [
        ...words,
        ...(result.addedWords ?? []),
      ]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "La traduction n’a pas pu être évaluée.",
      );
    } finally {
      setEvaluationBusy(null);
    }
  }

  const translationScores = evaluations.flatMap((item) =>
    item ? [item.score] : [],
  );
  const translationScore =
    translationScores.length > 0
      ? Number(
          (
            translationScores.reduce((total, score) => total + score, 0) /
            translationScores.length
          ).toFixed(1),
        )
      : null;

  function skipStep() {
    setError("");
    setStep((current) => (current < 4 ? ((current + 1) as 2 | 3 | 4) : current));
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-10 pt-6 sm:px-7 sm:pt-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-400">Un parcours guidé, sans détour</p>
          <h1 className="mt-1 font-serif text-3xl tracking-[-0.04em] text-white sm:text-4xl">
            Session express du jour
          </h1>
        </div>
        {step < 4 ? (
          <button
            type="button"
            onClick={skipStep}
            className="min-h-11 rounded-full border border-white/[0.1] bg-white/[0.035] px-4 text-sm text-zinc-300 transition hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
          >
            Passer cette étape
          </button>
        ) : null}
      </header>

      <section
        aria-label={`Étape ${Math.min(step, 3)} sur 3`}
        className="mb-5 rounded-2xl border border-white/[0.08] bg-[#111114] p-4 sm:p-5"
      >
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-zinc-100">
            {step === 4 ? "Bilan de la session" : `Étape ${step} / 3`}
          </span>
          <span className="text-zinc-400">Session · 10 min</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2" aria-hidden="true">
          {[1, 2, 3].map((number) => (
            <span
              key={number}
              className={`h-1.5 rounded-full ${
                step === 4 || number <= step ? "bg-amber-300" : "bg-white/[0.1]"
              }`}
            />
          ))}
        </div>
      </section>

      {error ? (
        <p role="alert" className="mb-4 rounded-xl border border-rose-300/20 bg-rose-300/[0.07] px-4 py-3 text-sm text-rose-100">
          {error}
        </p>
      ) : null}

      {step === 1 ? (
        <section className="rounded-3xl border border-white/[0.08] bg-[#111114] p-5 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-amber-100">Échauffement FSRS</p>
              <h2 className="mt-2 font-serif text-2xl text-white">
                {discoveryMode ? "Un premier contact avec 4 mots" : "Réviser les cartes du jour"}
              </h2>
              <p className="mt-2 text-sm text-zinc-400">
                {discoveryMode
                  ? "Aucune carte n’est due : découvrez quelques mots ou passez directement à la leçon."
                  : `Jusqu’à ${initialDueCards.length} cartes dues, sans dépasser 8.`}
              </p>
            </div>
            <span className="rounded-full border border-white/[0.08] bg-black/20 px-3 py-1.5 text-xs text-zinc-300">
              {reviewedCount} révisée{reviewedCount === 1 ? "" : "s"}
            </span>
          </div>

          {discoveryLoading ? (
            <div role="status" className="skeleton-shimmer mt-6 h-48 rounded-2xl border border-white/[0.06]">
              <span className="sr-only">Préparation de quatre mots de découverte…</span>
            </div>
          ) : currentItem ? (
            <article className="mt-6 rounded-2xl border border-white/[0.08] bg-black/20 p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-zinc-400">
                  {currentItem.kind === "discovery" ? "Nouveau mot" : "Carte due"} · {currentWord}
                </p>
                <button
                  type="button"
                  onClick={() => setRevealed((value) => !value)}
                  className="min-h-11 rounded-full border border-white/[0.1] px-4 text-sm text-zinc-200 hover:bg-white/[0.06]"
                >
                  {revealed ? "Masquer la réponse" : "Révéler la réponse"}
                </button>
              </div>
              <p className="mt-6 break-words font-serif text-3xl text-white sm:text-4xl">
                {revealed ? currentItem.card.translation : currentItem.card.term}
              </p>
              {revealed ? (
                <>
                  <p className="mt-2 text-xs text-zinc-400">
                    {currentItem.kind === "discovery"
                      ? currentItem.card.part_of_speech
                      : currentItem.card.phonetic ?? "Vocabulaire"}
                  </p>
                  <p className="mt-4 text-sm leading-6 text-zinc-300">
                    {currentItem.kind === "discovery"
                      ? currentItem.card.example_sentence
                      : currentItem.card.exampleSentence}
                  </p>
                </>
              ) : null}
              <RatingButtons
                onRate={(rating) => void rateCurrentCard(rating)}
                disabled={!revealed || reviewBusy}
              />
            </article>
          ) : !discoveryLoading && discoveryMode ? (
            <button
              type="button"
              onClick={() => void loadDiscovery()}
              className="mt-6 min-h-11 rounded-full bg-white px-5 text-sm font-medium text-zinc-950 hover:bg-zinc-200"
            >
              Réessayer la préparation des mots
            </button>
          ) : null}
          <div className="mt-6 flex flex-wrap justify-end">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200"
            >
              {queue.length > 1 ? "Continuer sans finir" : "Passer à la micro-leçon"}
              <span aria-hidden="true" className="ml-2">→</span>
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="rounded-3xl border border-white/[0.08] bg-[#111114] p-5 sm:p-8">
          <p className="text-sm font-medium text-violet-200">Micro-leçon ciblée · {cefrLevel}</p>
          {lessonLoading ? (
            <div role="status" className="skeleton-shimmer mt-5 h-64 rounded-2xl border border-white/[0.06]">
              <span className="sr-only">Préparation de la micro-leçon…</span>
            </div>
          ) : lesson ? (
            <>
              <h2 className="mt-2 font-serif text-2xl text-white sm:text-3xl">{lesson.topic}</h2>
              <p className="mt-4 whitespace-pre-line text-sm leading-7 text-zinc-300">
                {lesson.content_en}
              </p>
              <p className="mt-3 whitespace-pre-line border-l border-violet-200/20 pl-4 text-sm leading-6 text-zinc-400">
                {lesson.content_fr}
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                {lesson.keywords.map((keyword) => (
                  <div key={keyword.term} className="min-w-0 max-w-full rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                    <p className="break-words text-sm font-medium text-white">{keyword.term}</p>
                    <p className="mt-1 break-words text-xs text-zinc-400">{keyword.translation}</p>
                    <button
                      type="button"
                      onClick={() => void addKeyword(keyword)}
                      disabled={Boolean(cardStatuses[keyword.term])}
                      className="mt-2 min-h-10 rounded-full border border-white/[0.1] px-3 text-xs text-zinc-200 transition hover:bg-white/[0.07] disabled:cursor-default disabled:opacity-65"
                    >
                      {cardStatuses[keyword.term] ?? "+ Ajouter au deck"}
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-7 border-t border-white/[0.08] pt-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">Mini-QCM de compréhension</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {quizScore === null ? "Choisissez une réponse par question." : `Score : ${quizScore} / 10`}
                    </p>
                  </div>
                  {quizScore === null ? (
                    <button
                      type="button"
                      onClick={() => void submitQuiz()}
                      disabled={!allQuizQuestionsAnswered || quizBusy}
                      className="min-h-11 rounded-full bg-white px-4 text-sm font-medium text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {quizBusy ? "Correction…" : "Valider le QCM"}
                    </button>
                  ) : null}
                </div>
                <div className="mt-4 space-y-4">
                  {lesson.quiz.map((question, questionIndex) => (
                    <fieldset key={`${lesson.id}-${questionIndex}`} className="rounded-2xl border border-white/[0.06] bg-black/15 p-4">
                      <legend className="max-w-full px-1 text-sm leading-6 text-zinc-200">
                        {question.question}
                      </legend>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {question.options.map((option, optionIndex) => (
                          <button
                            key={option}
                            type="button"
                            disabled={quizScore !== null}
                            onClick={() =>
                              setAnswers((current) => {
                                const next = [...current];
                                next[questionIndex] = optionIndex;
                                return next;
                              })
                            }
                            className={`min-h-11 rounded-xl border px-3 py-2 text-left text-sm transition ${
                              answers[questionIndex] === optionIndex
                                ? "border-violet-200/40 bg-violet-200/[0.08] text-violet-100"
                                : "border-white/[0.08] text-zinc-400 hover:bg-white/[0.04]"
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                      {quizScore !== null ? (
                        <p className="mt-3 text-xs leading-5 text-zinc-400">{question.explanation}</p>
                      ) : null}
                    </fieldset>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="mt-5 rounded-2xl border border-white/[0.06] bg-black/20 p-5">
              <p className="text-sm text-zinc-300">
                La leçon n’a pas pu être chargée. Vous pouvez réessayer ou passer à la pratique.
              </p>
              <button
                type="button"
                onClick={() => void loadLesson()}
                className="mt-3 min-h-11 rounded-full border border-white/[0.1] px-4 text-sm text-zinc-200 hover:bg-white/[0.06]"
              >
                Réessayer
              </button>
            </div>
          )}
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200"
            >
              Passer à la mise en pratique <span aria-hidden="true" className="ml-2">→</span>
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="rounded-3xl border border-white/[0.08] bg-[#111114] p-5 sm:p-8">
          <p className="text-sm font-medium text-amber-100">Mise en pratique active · FR → EN</p>
          <h2 className="mt-2 font-serif text-2xl text-white">À vous de formuler</h2>
          {drillsLoading ? (
            <div role="status" className="skeleton-shimmer mt-5 h-56 rounded-2xl border border-white/[0.06]">
              <span className="sr-only">Préparation des deux phrases…</span>
            </div>
          ) : drills.length > 0 ? (
            <div className="mt-5 space-y-4">
              {drills.map((drill, index) => (
                <article key={`${index}-${drill.french_sentence}`} className="rounded-2xl border border-white/[0.08] bg-black/20 p-4 sm:p-5">
                  <p className="text-xs text-zinc-500">Phrase {index + 1} / 2</p>
                  <p className="mt-2 text-base leading-7 text-zinc-100">{drill.french_sentence}</p>
                  {evaluations[index] ? (
                    <div className="mt-4 border-t border-white/[0.08] pt-4">
                      <p className="text-sm text-zinc-300">{translations[index]}</p>
                      <p className="mt-3 text-xs text-zinc-500">Version naturelle</p>
                      <p className="mt-1 text-sm text-emerald-100">{evaluations[index]?.ideal_translation}</p>
                      <p className="mt-2 text-xs leading-5 text-zinc-400">{evaluations[index]?.feedback_fr}</p>
                      <span className="mt-3 inline-flex rounded-full border border-amber-200/15 bg-amber-200/[0.06] px-3 py-1.5 text-sm tabular-nums text-amber-100">
                        {evaluations[index]?.score} / 10
                      </span>
                    </div>
                  ) : (
                    <div className="mt-4">
                      <label className="sr-only" htmlFor={`session-translation-${index}`}>
                        Votre traduction de la phrase {index + 1}
                      </label>
                      <textarea
                        id={`session-translation-${index}`}
                        value={translations[index]}
                        onChange={(event) =>
                          setTranslations((current) => {
                            const next = [...current];
                            next[index] = event.target.value;
                            return next;
                          })
                        }
                        rows={2}
                        placeholder="Votre traduction en anglais…"
                        className="min-h-20 w-full resize-y rounded-xl border border-white/[0.1] bg-zinc-950/70 px-3 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-amber-200/40"
                      />
                      <button
                        type="button"
                        onClick={() => void evaluateTranslation(index)}
                        disabled={!translations[index].trim() || evaluationBusy !== null}
                        className="mt-3 min-h-11 rounded-full border border-white/[0.1] bg-white/[0.05] px-4 text-sm text-zinc-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {evaluationBusy === index ? "Correction…" : "Corriger"}
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void loadDrills()}
              className="mt-5 min-h-11 rounded-full border border-white/[0.1] px-4 text-sm text-zinc-200 hover:bg-white/[0.06]"
            >
              Réessayer la génération
            </button>
          )}
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => setStep(4)}
              className="inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200"
            >
              Voir le bilan <span aria-hidden="true" className="ml-2">→</span>
            </button>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="rounded-3xl border border-white/[0.08] bg-[#111114] p-6 text-center sm:p-10">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.06] text-2xl text-emerald-200">
            ✓
          </span>
          <p className="mt-5 text-sm text-emerald-200">Session terminée</p>
          <h2 className="mt-1 font-serif text-3xl tracking-[-0.04em] text-white">
            Votre pratique du jour
          </h2>
          <div className="mx-auto mt-7 grid max-w-2xl gap-3 text-left sm:grid-cols-2">
            {[
              ["Cartes révisées", `${reviewedCount}`],
              ["Mots ajoutés", `${new Set(addedWords).size}`],
              ["Compréhension", quizScore === null ? "—" : `${quizScore} / 10`],
              ["Traduction", translationScore === null ? "—" : `${translationScore} / 10`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                <p className="text-xs text-zinc-400">{label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{value}</p>
              </div>
            ))}
          </div>
          {addedWords.length > 0 ? (
            <p className="mx-auto mt-4 max-w-xl break-words text-sm leading-6 text-zinc-400">
              {`Vocabulaire ajouté : ${[...new Set(addedWords)].join(", ")}`}
            </p>
          ) : null}
          <Link
            href="/"
            className="mt-7 inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200"
          >
            Retour au tableau de bord
          </Link>
        </section>
      ) : null}
    </main>
  );
}
