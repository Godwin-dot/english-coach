"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  GeneratedMistakeQuizSchema,
  type GeneratedMistakeQuiz,
} from "@/schemas/mistakes";

function getErrorMessage(body: unknown): string {
  return typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
    ? body.error
    : "Le mini-quiz n’a pas pu être chargé.";
}

export function MistakeQuizModal({
  isOpen,
  category,
  onClose,
}: {
  isOpen: boolean;
  category: string | null;
  onClose: () => void;
}) {
  const [portalReady, setPortalReady] = useState(false);
  const [quiz, setQuiz] = useState<GeneratedMistakeQuiz | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [finished, setFinished] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const startedAt = useRef(Date.now());

  useEffect(() => setPortalReady(true), []);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    startedAt.current = Date.now();
    setQuiz(null);
    setQuestionIndex(0);
    setAnswers([]);
    setError("");
    setSaving(false);
    setSaved(false);
    setFinished(false);
    setLoading(true);

    void (async () => {
      try {
        const response = await fetch("/api/mistakes/quiz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(category ? { category } : {}),
          cache: "no-store",
        });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(getErrorMessage(body));
        const result = GeneratedMistakeQuizSchema.parse(body);
        if (active) setQuiz(result);
      } catch (caught) {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Le mini-quiz n’a pas pu être chargé.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [category, isOpen, retryCount]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen, onClose, saving]);

  if (!isOpen || !portalReady || typeof document === "undefined") return null;

  const question = quiz?.questions[questionIndex];
  const selectedAnswer = answers[questionIndex];
  const correctCount = quiz
    ? answers.reduce(
        (total, answer, index) =>
          total + (answer === quiz.questions[index]?.correct_index ? 1 : 0),
        0,
      )
    : 0;
  const score = Math.round(correctCount * 2.5 * 10) / 10;

  async function saveResult() {
    if (!quiz || saving || saved) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/mistakes/quiz/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: category ?? quiz.category,
          score,
          duration_s: Math.max(
            0,
            Math.floor((Date.now() - startedAt.current) / 1000),
          ),
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(getErrorMessage(body));
      setSaved(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Le résultat n’a pas pu être enregistré.",
      );
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="mistake-quiz-title"
        className="max-h-[min(90dvh,780px)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#0A0A0A] p-5 sm:p-7"
      >
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-100">
              {category ?? "Remédiation personnalisée"}
            </p>
            <h2
              id="mistake-quiz-title"
              className="mt-1 break-words font-serif text-2xl text-white sm:text-3xl"
            >
              {quiz?.title_fr ?? "Mini-quiz ciblé"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Fermer le mini-quiz"
            className="grid size-11 shrink-0 place-items-center rounded-full border border-white/[0.08] text-xl text-zinc-300 transition hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ×
          </button>
        </header>

        {loading ? (
          <div
            role="status"
            className="skeleton-shimmer mt-6 h-64 rounded-2xl border border-white/[0.06]"
          >
            <span className="sr-only">Préparation de quatre questions…</span>
          </div>
        ) : error && !quiz ? (
          <div className="mt-6 rounded-2xl border border-rose-300/20 bg-rose-300/[0.06] p-4">
            <p role="alert" className="text-sm leading-6 text-rose-100">
              {error}
            </p>
            <button
              type="button"
              onClick={() => setRetryCount((current) => current + 1)}
              className="mt-3 min-h-11 rounded-full border border-white/[0.1] px-4 text-sm text-zinc-100 hover:bg-white/[0.06]"
            >
              Réessayer
            </button>
          </div>
        ) : finished && quiz ? (
          <div className="mt-6 rounded-2xl border border-white/[0.08] bg-black/20 p-5 text-center sm:p-7">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.06] text-2xl text-emerald-200">
              ✓
            </span>
            <p className="mt-4 text-sm text-zinc-400">Votre résultat</p>
            <p className="mt-1 font-mono text-4xl tabular-nums text-white">
              {score.toLocaleString("fr-FR")}<span className="ml-1 text-xl text-zinc-400">/ 10</span>
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              {correctCount} réponse{correctCount === 1 ? "" : "s"} juste{correctCount === 1 ? "" : "s"} sur 4
            </p>
            {error ? (
              <p role="alert" className="mt-4 text-sm text-rose-100">{error}</p>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {!saved ? (
                <button
                  type="button"
                  onClick={() => void saveResult()}
                  disabled={saving}
                  className="min-h-11 rounded-full bg-white px-5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-50"
                >
                  {saving ? "Enregistrement…" : "Valider le score"}
                </button>
              ) : (
                <span role="status" className="inline-flex min-h-11 items-center rounded-full border border-emerald-300/20 bg-emerald-300/[0.06] px-4 text-sm text-emerald-100">
                  Score enregistré
                </span>
              )}
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 rounded-full border border-white/[0.1] px-5 text-sm text-zinc-200 hover:bg-white/[0.06]"
              >
                Fermer
              </button>
            </div>
          </div>
        ) : question && quiz ? (
          <div className="mt-6">
            <div className="mb-4 flex items-center justify-between gap-3 text-xs text-zinc-400">
              <span>Question {questionIndex + 1} / 4</span>
              <span className="tabular-nums">{correctCount} juste{correctCount === 1 ? "" : "s"}</span>
            </div>
            <div className="mb-4 h-1.5 rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-amber-300 transition-[width] duration-150"
                style={{ width: `${((questionIndex + 1) / 4) * 100}%` }}
              />
            </div>
            <article className="rounded-2xl border border-white/[0.08] bg-black/20 p-4 sm:p-5">
              <p className="break-words text-base leading-7 text-white sm:text-lg">
                {question.prompt_en}
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                {question.context_fr}
              </p>
              <div className="mt-5 space-y-2">
                {question.options.map((option, optionIndex) => {
                  const isCorrect =
                    selectedAnswer !== undefined &&
                    optionIndex === question.correct_index;
                  const isIncorrect =
                    selectedAnswer === optionIndex &&
                    selectedAnswer !== question.correct_index;
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={selectedAnswer !== undefined}
                      onClick={() =>
                        setAnswers((current) => {
                          const next = [...current];
                          next[questionIndex] = optionIndex;
                          return next;
                        })
                      }
                      className={`min-h-11 w-full rounded-xl border px-3 py-2 text-left text-sm leading-5 transition-all duration-150 active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 disabled:cursor-default ${
                        isCorrect
                          ? "border-emerald-300/35 bg-emerald-300/[0.08] text-emerald-100"
                          : isIncorrect
                            ? "border-rose-300/35 bg-rose-300/[0.08] text-rose-100"
                            : "border-white/[0.08] text-zinc-300 hover:bg-white/[0.05] disabled:opacity-60"
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              {selectedAnswer !== undefined ? (
                <p className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-3 text-sm leading-6 text-zinc-300">
                  {question.explanation_fr}
                </p>
              ) : null}
            </article>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                disabled={selectedAnswer === undefined}
                onClick={() => {
                  if (questionIndex === quiz.questions.length - 1) {
                    setFinished(true);
                  } else {
                    setQuestionIndex((current) => current + 1);
                  }
                }}
                className="min-h-11 rounded-full bg-white px-5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {questionIndex === quiz.questions.length - 1
                  ? "Voir mon score"
                  : "Question suivante"}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>,
    document.body,
  );
}
