"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DiscoveryCard, ReviewCardView } from "@/domain/cards";
import type { ReviewIntervals, ReviewRating } from "@/srs";
import { useSessionState } from "@/hooks/useSessionState";
import { useHotkeys } from "@/hooks/useHotkeys";
import { AudioPlayerBar } from "@/components/AudioPlayerBar";
import { useSpeechEngine } from "@/hooks/useSpeechEngine";

type DueQueueItem = {
  key: string;
  isDiscovery: false;
  data: ReviewCardView;
};

type DiscoveryQueueItem = {
  key: string;
  isDiscovery: true;
  data: DiscoveryCard;
};

type ReviewQueueItem = DueQueueItem | DiscoveryQueueItem;

type DueBatch = {
  cards: ReviewCardView[];
  remainingDueCount: number;
};

type DiscoveryBatch = {
  cards: DiscoveryCard[];
};

type ReviewSessionState = {
  cards: ReviewQueueItem[];
  reviewedCount: number;
  processedCount: number;
  dueRemaining: number;
  sessionFinished: boolean;
  revealed: boolean;
  seenDiscoveryTerms: string[];
};

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

function makeDiscoveryQueueItem(data: DiscoveryCard): DiscoveryQueueItem {
  return {
    key: `discovery-${data.discoveryId}`,
    isDiscovery: true,
    data,
  };
}

export function ReviewWorkspace({
  initialCards,
  totalDueCount,
}: {
  initialCards: ReviewCardView[];
  totalDueCount: number;
}) {
  const [session, setSession, isHydrated] = useSessionState<ReviewSessionState>(
    "english-coach:review:v1",
    {
      cards: initialCards.map((data) => ({
        key: `due-${data.id}`,
        isDiscovery: false,
        data,
      })),
      reviewedCount: 0,
      processedCount: 0,
      dueRemaining: totalDueCount,
      sessionFinished: false,
      revealed: false,
      seenDiscoveryTerms: [],
    },
  );
  const {
    cards,
    reviewedCount,
    processedCount,
    dueRemaining,
    sessionFinished,
    revealed,
  } = session;
  const [loadingMore, setLoadingMore] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const speechEngine = useSpeechEngine();
  const startedAt = useRef(Date.now());
  const seenDiscoveryTerms = useRef(new Set(session.seenDiscoveryTerms));
  const loadingMoreRef = useRef(false);
  const previousQueueKey = useRef<string | null>(null);
  const queueItem = cards[0] ?? null;
  const currentCard = queueItem?.data ?? null;
  const discoveryMode = dueRemaining === 0;
  const currentNumber = processedCount + 1;

  useEffect(() => {
    if (isHydrated) {
      seenDiscoveryTerms.current = new Set(session.seenDiscoveryTerms);
    }
  }, [isHydrated, session.seenDiscoveryTerms]);

  const loadNextBatch = useCallback(async () => {
    if (!isHydrated || loadingMoreRef.current || sessionFinished) {
      return;
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError("");

    try {
      if (dueRemaining > 0) {
        const queuedDueIds = cards.flatMap((item) =>
          item.isDiscovery ? [] : [item.data.id],
        );
        const query = new URLSearchParams({
          mode: "due",
          excludeIds: [...new Set(queuedDueIds)].join(","),
        });
        const response = await fetch(`/api/review?${query.toString()}`, {
          cache: "no-store",
        });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(getErrorMessage(body));
        }

        const batch = body as DueBatch;
        if (batch.cards.length) {
          setSession((current) => {
            const currentIds = new Set(
              current.cards.flatMap((item) =>
                item.isDiscovery ? [] : [item.data.id],
              ),
            );
            const additions = batch.cards
              .filter(({ id }) => !currentIds.has(id))
              .map(
                (data): DueQueueItem => ({
                  key: `due-${data.id}`,
                  isDiscovery: false,
                  data,
                }),
              );
            return additions.length
              ? { ...current, cards: [...current.cards, ...additions] }
              : current;
          });
        } else if (queuedDueIds.length === 0) {
          setSession((current) => ({ ...current, dueRemaining: 0 }));
        }
        return;
      }

      const excludeTerms = [...seenDiscoveryTerms.current].slice(-500);
      const response = await fetch("/api/review/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludeTerms }),
        cache: "no-store",
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(getErrorMessage(body));
      }

      const batch = body as DiscoveryBatch;
      const additions = batch.cards.filter((item) => {
        const term = item.term.trim().toLocaleLowerCase("en");
        if (seenDiscoveryTerms.current.has(term)) {
          return false;
        }
        seenDiscoveryTerms.current.add(term);
        return true;
      });
      setSession((current) => ({
        ...current,
        seenDiscoveryTerms: [...seenDiscoveryTerms.current],
      }));
      if (additions.length) {
        setSession((current) => ({
          ...current,
          cards: [...current.cards, ...additions.map(makeDiscoveryQueueItem)],
        }));
      } else {
        throw new Error("Aucun nouveau mot n’a été proposé. Réessayez.");
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible de charger les cartes suivantes.",
      );
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [cards, dueRemaining, isHydrated, sessionFinished, setSession]);

  useEffect(() => {
    if (isHydrated && cards.length <= 2 && !sessionFinished) {
      void loadNextBatch();
    }
  }, [cards.length, isHydrated, loadNextBatch, sessionFinished]);

  useEffect(() => {
    if (!isHydrated) return;
    if (previousQueueKey.current === null) {
      previousQueueKey.current = queueItem?.key ?? "";
      startedAt.current = Date.now();
      return;
    }
    if (previousQueueKey.current !== (queueItem?.key ?? "")) {
      previousQueueKey.current = queueItem?.key ?? "";
      setSession((current) => ({ ...current, revealed: false }));
      setError("");
      startedAt.current = Date.now();
    }
  }, [isHydrated, queueItem?.key, setSession]);

  const submitReview = useCallback(
    async (rating: ReviewRating) => {
      if (!queueItem || !currentCard || isSubmitting || !revealed) {
        return;
      }

      setIsSubmitting(true);
      setError("");
      const durationS = Math.max(
        0,
        Math.round((Date.now() - startedAt.current) / 1000),
      );

      try {
        const reviewBody = queueItem.isDiscovery
          ? {
              discoveryCard: {
                term: queueItem.data.term,
                translation: queueItem.data.translation,
                part_of_speech: queueItem.data.part_of_speech,
                example_sentence: queueItem.data.example_sentence,
                example_translation: queueItem.data.example_translation,
                mnemonic: queueItem.data.mnemonic,
              },
              rating,
              duration_s: durationS,
            }
          : {
              cardId: queueItem.data.id,
              rating,
              duration_s: durationS,
              mode: "due",
            };
        const response = await fetch("/api/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reviewBody),
        });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(getErrorMessage(body));
        }

        if (!queueItem.isDiscovery) {
          setSession((current) => ({
            ...current,
            dueRemaining: Math.max(current.dueRemaining - 1, 0),
          }));
        }
        setSession((current) => ({
          ...current,
          cards: current.cards.filter((item) => item.key !== queueItem.key),
          reviewedCount: current.reviewedCount + 1,
          processedCount: current.processedCount + 1,
          revealed: false,
        }));
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
    [currentCard, isSubmitting, queueItem, revealed, setSession],
  );

  const skipKnownWord = useCallback(() => {
    if (!queueItem?.isDiscovery || isSubmitting) {
      return;
    }
    setSession((current) => ({
      ...current,
      cards: current.cards.filter((item) => item.key !== queueItem.key),
      processedCount: current.processedCount + 1,
      revealed: false,
    }));
  }, [isSubmitting, queueItem, setSession]);

  const refreshQueue = useCallback(async () => {
    if (!isHydrated || loadingMoreRef.current || isSubmitting) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError("");
    try {
      const response = await fetch("/api/review?mode=due", {
        cache: "no-store",
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(getErrorMessage(body));
      const batch = body as DueBatch;
      seenDiscoveryTerms.current.clear();
      setSession({
        cards: batch.cards.map((data) => ({
          key: `due-${data.id}`,
          isDiscovery: false,
          data,
        })),
        reviewedCount: 0,
        processedCount: 0,
        dueRemaining: batch.remainingDueCount,
        sessionFinished: false,
        revealed: false,
        seenDiscoveryTerms: [],
      });
      startedAt.current = Date.now();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible d’actualiser la file de révision.",
      );
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [isHydrated, isSubmitting, setSession]);

  useHotkeys(
    [
      {
        key: "Space",
        enabled: !revealed && currentCard !== null,
        action: () =>
          setSession((current) => ({ ...current, revealed: true })),
      },
      {
        key: "Enter",
        enabled: !revealed && currentCard !== null,
        action: () =>
          setSession((current) => ({ ...current, revealed: true })),
      },
      ...ratingButtons.map(({ rating }) => ({
        key: String(rating),
        enabled: revealed && !isSubmitting,
        action: () => void submitReview(rating),
      })),
      {
        key: "r",
        enabled: currentCard !== null,
        action: () => {
          if (currentCard && queueItem) {
            speechEngine.speak(
              currentCard.term,
              `review:${queueItem.key}:term`,
            );
          }
        },
      },
    ],
    !sessionFinished,
  );

  if (sessionFinished) {
    return (
      <main className="animate-view-enter mx-auto flex min-h-[calc(100vh-7rem)] max-w-5xl items-center px-4 py-10 sm:px-8">
        <section className="relative w-full overflow-hidden rounded-3xl border border-white/[0.08] bg-[#111114] px-6 py-10 text-center sm:px-12 sm:py-14">
          <div
            aria-hidden="true"
            className="ambient-glow pointer-events-none absolute left-1/2 top-[-60%] size-[440px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.12),rgba(99,102,241,0.1)_48%,transparent_72%)] blur-2xl"
          />
          <div className="relative mx-auto max-w-xl">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.06] text-2xl text-emerald-200">
              ✓
            </span>
            <p className="mt-6 text-sm font-medium text-emerald-200">
              Belle régularité
            </p>
            <h1 className="mt-2 font-serif text-4xl tracking-[-0.05em] text-white sm:text-5xl">
              Session terminée.
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-zinc-400">
              Vous avez révisé {reviewedCount}{" "}
              {reviewedCount === 1 ? "carte" : "cartes"} et passé{" "}
              {processedCount - reviewedCount}{" "}
              {processedCount - reviewedCount === 1 ? "mot" : "mots"}.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() =>
                  setSession((current) => ({ ...current, sessionFinished: false }))
                }
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-medium text-zinc-950 transition-colors duration-150 hover:bg-zinc-200 active:scale-[0.98]"
              >
                Continuer à réviser <span aria-hidden="true">→</span>
              </button>
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

  if (!queueItem || !currentCard) {
    return (
      <main className="animate-view-enter mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
        <section className="rounded-3xl border border-white/[0.08] bg-[#111114] p-6 text-center sm:p-10">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-left">
            <p className="text-sm font-medium text-amber-200/90">
              {discoveryMode
                ? "Nouveau vocabulaire · Découverte infinie"
                : "Révisions espacées avec FSRS"}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void refreshQueue()}
                disabled={loadingMore}
                className="inline-flex min-h-11 items-center rounded-full border border-white/[0.08] bg-white/[0.035] px-4 text-xs font-medium text-zinc-300 transition-all duration-150 hover:bg-white/[0.08] active:scale-[0.985] disabled:opacity-50"
              >
                {loadingMore ? "Actualisation…" : "Actualiser la file"}
              </button>
              <button
                type="button"
                onClick={() =>
                  setSession((current) => ({ ...current, sessionFinished: true }))
                }
                className="inline-flex min-h-11 items-center rounded-full border border-white/[0.08] bg-white/[0.035] px-4 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.08] hover:text-white"
              >
                Terminer la session
              </button>
            </div>
          </div>
          <p className="mb-5 text-xs text-zinc-400">
            Dues : <span className="text-white">{dueRemaining}</span>
            <span className="mx-2 text-zinc-700">·</span>
            Révisées : <span className="text-white">{reviewedCount}</span>
          </p>
          {discoveryMode ? (
            <div className="mb-5 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.045] px-4 py-3 text-sm text-emerald-100">
              Cartes du jour terminées — préparation de nouveaux mots.
            </div>
          ) : null}
          <div
            role="status"
            aria-label={
              discoveryMode
                ? "Préparation de nouveaux mots"
                : "Chargement des cartes dues"
            }
            className="mx-auto max-w-sm animate-pulse space-y-3"
          >
            <div className="mx-auto h-3 w-32 rounded-full bg-white/[0.08]" />
            <div className="mx-auto h-8 w-56 rounded-full bg-white/[0.06]" />
          </div>
          <p className="mt-5 text-sm text-zinc-400">
            {error ||
              (discoveryMode
                ? "Préparation de nouveaux mots…"
                : "Chargement des cartes dues…")}
          </p>
          {error ? (
            <button
              type="button"
              onClick={() => void loadNextBatch()}
              className="mt-5 inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-medium text-zinc-950 hover:bg-zinc-200"
            >
              Réessayer
            </button>
          ) : null}
        </section>
      </main>
    );
  }

  const cardTerm = currentCard.term;
  const cardTranslation = currentCard.translation;
  const cardPhonetic = queueItem.isDiscovery
    ? queueItem.data.part_of_speech
    : queueItem.data.phonetic;
  const cardExample = queueItem.isDiscovery
    ? queueItem.data.example_sentence
    : queueItem.data.exampleSentence;
  const cardExampleTranslation = queueItem.isDiscovery
    ? queueItem.data.example_translation
    : queueItem.data.exampleTranslation;
  const cardMnemonic = currentCard.mnemonic;
  const intervals: ReviewIntervals = currentCard.intervals;

  return (
    <main className="animate-view-enter mx-auto max-w-5xl px-4 pb-8 pt-8 sm:px-8 sm:pt-12">
      <header className="page-enter mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-amber-200/90">
            {discoveryMode
              ? "Nouveau vocabulaire · Découverte infinie"
              : "Révisions espacées avec FSRS"}
          </p>
          <h1 className="mt-2 font-serif text-4xl tracking-[-0.05em] text-white sm:text-5xl">
            À vous de jouer.
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshQueue()}
            disabled={loadingMore}
            className="inline-flex min-h-11 items-center rounded-full border border-white/[0.08] bg-white/[0.035] px-4 text-xs font-medium text-zinc-300 transition-all duration-150 hover:bg-white/[0.08] active:scale-[0.985] disabled:opacity-50"
          >
            {loadingMore ? "Actualisation…" : "Actualiser la file"}
          </button>
          <button
            type="button"
            onClick={() =>
              setSession((current) => ({ ...current, sessionFinished: true }))
            }
            className="inline-flex min-h-11 items-center rounded-full border border-white/[0.08] bg-white/[0.035] px-4 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.08] hover:text-white"
          >
            Terminer la session
          </button>
        </div>
      </header>

      <AudioPlayerBar compact engine={speechEngine} className="mb-5" />

      <section aria-label="Progression de la session" className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-3 text-xs">
          <p className="font-medium text-zinc-300">
            Dues :{" "}
            <span className="tabular-nums text-white">{dueRemaining}</span>
            <span className="mx-2 text-zinc-700">·</span>
            Révisées :{" "}
            <span className="tabular-nums text-white">{reviewedCount}</span>
          </p>
          <p className="text-zinc-500">
            {discoveryMode
              ? `Découverte · Carte ${currentNumber}`
              : `Cartes dues · Carte ${currentNumber}`}
          </p>
        </div>
      </section>

      {discoveryMode ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.045] px-4 py-3 text-sm text-emerald-100">
          <span>
            Cartes du jour terminées — place à la découverte de nouveaux mots.
          </span>
          {loadingMore ? (
            <span className="text-xs text-emerald-100/70">
              Préparation de nouveaux mots…
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="review-scene min-h-[430px]">
        <div className={`review-card-inner ${revealed ? "is-flipped" : ""}`}>
          <article className="review-card-face review-card-front flex min-h-[430px] flex-col items-center justify-center rounded-3xl border border-white/[0.08] bg-[#111114] px-5 py-8 text-center sm:px-10">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-0 size-72 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.09),rgba(99,102,241,0.06)_45%,transparent_72%)] blur-2xl"
            />
            <div className="relative flex items-center gap-3">
              <p className="text-xs font-medium text-zinc-400">
                {queueItem.isDiscovery ? "Nouveau mot" : "English"}
              </p>
              <AudioPlayerBar
                mode="compact"
                rates={[0.75, 1]}
                engine={speechEngine}
                text={cardTerm}
                sourceId={`review:${queueItem.key}:term`}
              />
            </div>
            <h2 className="relative mt-6 max-w-full break-words font-serif text-4xl tracking-[-0.04em] text-white sm:text-5xl">
              {cardTerm}
            </h2>
            <p className="relative mt-4 text-sm text-zinc-500">
              {cardPhonetic || " "}
            </p>
            <button
              type="button"
              onClick={() =>
                setSession((current) => ({ ...current, revealed: true }))
              }
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
                  {queueItem.isDiscovery ? "Nouveau mot" : "English"}
                </p>
                <h2 className="mt-2 break-words font-serif text-3xl tracking-[-0.04em] text-white sm:text-4xl">
                  {cardTerm}
                </h2>
                <p className="mt-1 text-xs text-zinc-500">{cardPhonetic}</p>
              </div>
              <AudioPlayerBar
                mode="compact"
                rates={[0.75, 1]}
                engine={speechEngine}
                text={cardTerm}
                sourceId={`review:${queueItem.key}:term`}
              />
            </div>

            <p className="mt-5 border-l-2 border-amber-200/60 pl-4 font-serif text-2xl leading-snug text-amber-100">
              {cardTranslation}
            </p>

            <div className="mt-6 rounded-2xl border border-white/[0.07] bg-black/20 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="font-serif text-base italic leading-7 text-zinc-200">
                  “{cardExample}”
                </p>
                <AudioPlayerBar
                  mode="compact"
                  rates={[0.75, 1]}
                  engine={speechEngine}
                  text={cardExample}
                  sourceId={`review:${queueItem.key}:example`}
                />
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                {cardExampleTranslation}
              </p>
            </div>

            {cardMnemonic ? (
              <div className="mt-4 rounded-xl border border-violet-300/10 bg-violet-300/[0.04] px-4 py-3">
                <p className="text-xs font-medium text-violet-200/80">
                  Moyen mnémotechnique
                </p>
                <p className="mt-1.5 text-sm leading-6 text-zinc-300">
                  {cardMnemonic}
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

      <p className="mt-4 hidden items-center justify-center gap-2 text-xs text-zinc-500 sm:flex">
        Espace : retourner <span aria-hidden="true">·</span> 1-4 : noter{" "}
        <span aria-hidden="true">·</span> R : écouter
      </p>

      {revealed ? (
        <section aria-label="Évaluer votre réponse" className="mt-5">
          <p className="mb-3 text-center text-xs text-zinc-500">
            Comment était cette carte ?{" "}
            <span className="hidden sm:inline">Raccourcis 1-4</span>
          </p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {ratingButtons.map(({ rating, label, accent: buttonAccent }) => (
              <button
                key={rating}
                type="button"
                disabled={isSubmitting}
                onClick={() => void submitReview(rating)}
                className={`flex min-h-[62px] flex-col items-center justify-center rounded-2xl border px-3 py-2 transition-all duration-150 active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 disabled:cursor-wait disabled:opacity-50 ${buttonAccent}`}
              >
                <span className="text-sm font-semibold">
                  {rating} · {label}
                </span>
                <span className="mt-1 text-[11px] opacity-70">
                  {intervals[rating]}
                </span>
              </button>
            ))}
          </div>
          {queueItem.isDiscovery ? (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={skipKnownWord}
              className="mx-auto mt-4 flex min-h-11 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.035] px-4 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
            >
              Déjà connu / Passer
            </button>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
