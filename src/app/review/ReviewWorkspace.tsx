"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewCardView } from "@/domain/cards";
import type { ReviewRating } from "@/srs";

const ratingButtons: Array<{
  rating: ReviewRating;
  label: string;
  accent: string;
}> = [
  {
    rating: 1,
    label: "À revoir",
    accent:
      "border-rose-400/20 bg-rose-400/[0.05] text-rose-100 hover:border-rose-300/40 hover:bg-rose-400/[0.1]",
  },
  {
    rating: 2,
    label: "Difficile",
    accent:
      "border-amber-300/20 bg-amber-300/[0.05] text-amber-100 hover:border-amber-200/40 hover:bg-amber-300/[0.1]",
  },
  {
    rating: 3,
    label: "Bien",
    accent:
      "border-emerald-300/20 bg-emerald-300/[0.05] text-emerald-100 hover:border-emerald-200/40 hover:bg-emerald-300/[0.1]",
  },
  {
    rating: 4,
    label: "Facile",
    accent:
      "border-indigo-300/20 bg-indigo-300/[0.05] text-indigo-100 hover:border-indigo-200/40 hover:bg-indigo-300/[0.1]",
  },
];

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

function speak(text: string, language: string): boolean {
  if (!("speechSynthesis" in window)) {
    return false;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language;
  window.speechSynthesis.speak(utterance);
  return true;
}

function AudioButton({
  text,
  language,
  onUnavailable,
  label,
}: {
  text: string;
  language: string;
  onUnavailable: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!speak(text, language)) {
          onUnavailable();
        }
      }}
      aria-label={label}
      className="grid size-11 shrink-0 place-items-center rounded-full border border-white/[0.1] bg-white/[0.04] text-zinc-200 transition-colors duration-150 hover:border-white/20 hover:bg-white/[0.09] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        className="size-[18px]"
      >
        <path
          d="M11 5 6 9H3v6h3l5 4V5Zm4 4a5 5 0 0 1 0 6m3-9a9 9 0 0 1 0 12"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

export function ReviewWorkspace({
  initialCards,
  totalDueCount,
}: {
  initialCards: ReviewCardView[];
  totalDueCount: number;
}) {
  const [cards, setCards] = useState(initialCards);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [accent, setAccent] = useState<"en-US" | "en-GB">("en-US");
  const startedAt = useRef(Date.now());
  const card = cards[0] ?? null;
  const sessionTotal = initialCards.length;
  const currentNumber = card ? reviewedCount + 1 : reviewedCount;
  const progress = sessionTotal
    ? Math.min((reviewedCount / sessionTotal) * 100, 100)
    : 0;

  useEffect(() => {
    setRevealed(false);
    setError("");
    startedAt.current = Date.now();
  }, [card?.id]);

  const submitReview = useCallback(
    async (rating: ReviewRating) => {
      if (!card || isSubmitting || !revealed) {
        return;
      }

      setIsSubmitting(true);
      setError("");
      const durationS = Math.max(
        0,
        Math.round((Date.now() - startedAt.current) / 1000),
      );

      try {
        const response = await fetch("/api/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId: card.id, rating, duration_s: durationS }),
        });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(getErrorMessage(body));
        }
        setCards((current) => current.filter((item) => item.id !== card.id));
        setReviewedCount((current) => current + 1);
        setRevealed(false);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "La révision n’a pas pu être enregistrée.",
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [card, isSubmitting, revealed],
  );

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }

      if ((event.code === "Space" || event.key === "Enter") && !revealed && card) {
        event.preventDefault();
        setRevealed(true);
        return;
      }

      const rating = Number(event.key);
      if (revealed && rating >= 1 && rating <= 4) {
        event.preventDefault();
        void submitReview(rating as ReviewRating);
      }
    }

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [card, revealed, submitReview]);

  function reportAudioUnavailable() {
    setError("La synthèse vocale n’est pas disponible dans ce navigateur.");
  }

  if (!card) {
    const remainingDue = Math.max(totalDueCount - sessionTotal, 0);
    const isSessionComplete = reviewedCount > 0;

    return (
      <main className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-5xl items-center px-4 py-10 sm:px-8">
        <section className="relative w-full overflow-hidden rounded-3xl border border-white/[0.08] bg-[#111114] px-6 py-10 text-center sm:px-12 sm:py-14">
          <div
            aria-hidden="true"
            className="ambient-glow pointer-events-none absolute left-1/2 top-[-60%] size-[440px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.12),rgba(99,102,241,0.1)_48%,transparent_72%)] blur-2xl"
          />
          <div className="relative mx-auto max-w-xl">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.06] text-2xl text-emerald-200">
              {isSessionComplete ? "✓" : "✦"}
            </span>
            <p className="mt-6 text-sm font-medium text-emerald-200">
              {isSessionComplete ? "Belle régularité" : "Révision FSRS"}
            </p>
            <h1 className="mt-2 font-serif text-4xl tracking-[-0.05em] text-white sm:text-5xl">
              {isSessionComplete
                ? "Session terminée."
                : totalDueCount
                  ? "Votre limite du jour est atteinte."
                  : "Tout est à jour."}
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-zinc-400">
              {isSessionComplete
                ? `Vous avez révisé ${reviewedCount} ${
                    reviewedCount === 1 ? "carte" : "cartes"
                  } aujourd’hui.`
                : totalDueCount
                  ? "Aucune carte n’est disponible dans votre plafond actuel. Revenez après avoir ajusté vos objectifs."
                  : "Aucune carte n’est à revoir pour le moment. Une nouvelle leçon est toujours une bonne occasion d’apprendre."}
              {isSessionComplete && remainingDue > 0
                ? ` ${remainingDue} autre${
                    remainingDue === 1 ? "" : "s"
                  } carte${remainingDue === 1 ? "" : "s"} attend${
                    remainingDue === 1 ? "" : "ent"
                  } une prochaine session.`
                : ""}
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/lesson"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-medium text-zinc-950 transition-colors duration-150 hover:bg-zinc-200 active:scale-[0.98]"
              >
                Découvrir de nouveaux mots <span aria-hidden="true">→</span>
              </Link>
              <Link
                href="/"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] px-5 text-sm font-medium text-zinc-200 transition-colors duration-150 hover:bg-white/[0.1] active:scale-[0.98]"
              >
                Retour au tableau de bord
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-8 pt-8 sm:px-8 sm:pt-12">
      <header className="page-enter mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-amber-200/90">
            Révisions espacées avec FSRS
          </p>
          <h1 className="mt-2 font-serif text-4xl tracking-[-0.05em] text-white sm:text-5xl">
            À vous de jouer.
          </h1>
        </div>
        <label className="flex min-h-11 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 text-xs text-zinc-400">
          Accent
          <select
            value={accent}
            onChange={(event) =>
              setAccent(event.target.value as "en-US" | "en-GB")
            }
            className="bg-transparent font-medium text-zinc-100 outline-none focus-visible:text-white"
            aria-label="Choisir l’accent audio"
          >
            <option value="en-US">US</option>
            <option value="en-GB">GB</option>
          </select>
        </label>
      </header>

      <section aria-label="Progression de la session" className="mb-5">
        <div className="mb-2 flex items-center justify-between text-xs">
          <p className="font-medium text-zinc-300">
            Carte <span className="text-white">{currentNumber}</span> / {sessionTotal}
          </p>
          <p className="text-zinc-500">
            {totalDueCount} {totalDueCount === 1 ? "carte due" : "cartes dues"}
          </p>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={sessionTotal}
          aria-valuenow={reviewedCount}
          aria-label="Progression de la session"
          className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]"
        >
          <div
            className="h-full rounded-full bg-amber-200 transition-[width] duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>
      </section>

      <div className="review-scene min-h-[430px]">
        <div className={`review-card-inner ${revealed ? "is-flipped" : ""}`}>
          <article className="review-card-face review-card-front flex min-h-[430px] flex-col items-center justify-center rounded-3xl border border-white/[0.08] bg-[#111114] px-5 py-8 text-center sm:px-10">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-0 size-72 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.09),rgba(99,102,241,0.06)_45%,transparent_72%)] blur-2xl"
            />
            <div className="relative flex items-center gap-3">
              <p className="text-xs font-medium text-zinc-400">
                English
              </p>
              <AudioButton
                text={card.term}
                language={accent}
                onUnavailable={reportAudioUnavailable}
                label={`Écouter ${card.term}`}
              />
            </div>
            <h2 className="relative mt-6 max-w-full break-words font-serif text-4xl tracking-[-0.04em] text-white sm:text-5xl">
              {card.term}
            </h2>
            <p className="relative mt-4 font-mono text-sm tracking-wide text-zinc-500">
              {card.phonetic ?? " "}
            </p>
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="relative mt-9 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-medium text-zinc-950 transition-colors duration-150 hover:bg-zinc-200 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
            >
              Révéler la réponse <span aria-hidden="true">↓</span>
            </button>
            <p className="relative mt-4 text-[10px] text-zinc-600">
              Espace ou Entrée
            </p>
          </article>

          <article className="review-card-face review-card-back min-h-[430px] rounded-3xl border border-white/[0.08] bg-[#111114] px-5 py-7 sm:px-9 sm:py-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-medium text-zinc-400">
                  English
                </p>
                <h2 className="mt-2 break-words font-serif text-3xl tracking-[-0.04em] text-white sm:text-4xl">
                  {card.term}
                </h2>
                <p className="mt-1 font-mono text-xs tracking-wide text-zinc-500">
                  {card.phonetic}
                </p>
              </div>
              <AudioButton
                text={card.term}
                language={accent}
                onUnavailable={reportAudioUnavailable}
                label={`Écouter ${card.term}`}
              />
            </div>

            <p className="mt-5 border-l-2 border-amber-200/60 pl-4 font-serif text-2xl leading-snug text-amber-100">
              {card.translation}
            </p>

            <div className="mt-6 rounded-2xl border border-white/[0.07] bg-black/20 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="font-serif text-base italic leading-7 text-zinc-200">
                  “{card.exampleSentence}”
                </p>
                <AudioButton
                  text={card.exampleSentence}
                  language={accent}
                  onUnavailable={reportAudioUnavailable}
                  label="Écouter l’exemple en anglais"
                />
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                {card.exampleTranslation}
              </p>
            </div>

            {card.mnemonic ? (
              <div className="mt-4 rounded-xl border border-violet-300/10 bg-violet-300/[0.04] px-4 py-3">
                <p className="text-xs font-medium text-violet-200/80">
                  Moyen mnémotechnique
                </p>
                <p className="mt-1.5 text-sm leading-6 text-zinc-300">
                  {card.mnemonic}
                </p>
              </div>
            ) : null}
          </article>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-rose-300/15 bg-rose-300/[0.05] px-4 py-3 text-sm text-rose-100"
        >
          {error}
        </p>
      ) : null}

      {revealed ? (
        <section aria-label="Évaluer votre réponse" className="mt-5">
          <p className="mb-3 text-center text-xs text-zinc-500">
            Comment était cette carte ? <span className="hidden sm:inline">Raccourcis 1-4</span>
          </p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {ratingButtons.map(({ rating, label, accent: buttonAccent }) => (
              <button
                key={rating}
                type="button"
                disabled={isSubmitting}
                onClick={() => void submitReview(rating)}
                className={`flex min-h-[62px] flex-col items-center justify-center rounded-2xl border px-3 py-2 transition-colors duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 disabled:cursor-wait disabled:opacity-50 ${buttonAccent}`}
              >
                <span className="text-sm font-semibold">
                  {rating} · {label}
                </span>
                <span className="mt-1 text-[11px] opacity-70">
                  {card.intervals[rating]}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
