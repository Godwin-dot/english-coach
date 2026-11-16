"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DrillHistoryEntry,
  HistoryCard,
} from "@/domain/history";
import type { MistakePattern } from "@/domain/mistakes";
import { MistakeQuizModal } from "@/components/MistakeQuizModal";
import type { lessons, mistakes } from "@/db/schema";

type LessonEntry = typeof lessons.$inferSelect;
type MistakeEntry = typeof mistakes.$inferSelect;

type FullHistory = {
  allCards: HistoryCard[];
  drillHistory: DrillHistoryEntry[];
  allLessons: LessonEntry[];
  allMistakes: MistakeEntry[];
};

type HistoryTab = "vocabulary" | "translations" | "lessons";

function speak(text: string, language: string) {
  if (!("speechSynthesis" in window)) {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language;
  window.speechSynthesis.speak(utterance);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date inconnue"
    : new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date inconnue"
    : new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function dateLabel(card: HistoryCard) {
  return card.isDue
    ? "À réviser"
    : `Prochaine révision : ${formatDate(card.due)}`;
}

function normalizedCategory(value: string | null | undefined) {
  return (value?.trim().replace(/\s+/gu, " ") || "Général").toLocaleLowerCase("fr");
}

export function HistoryWorkspace({
  history,
  initialPatterns,
}: {
  history: FullHistory;
  initialPatterns: MistakePattern[];
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<HistoryTab>("vocabulary");
  const [search, setSearch] = useState("");
  const [dueOnly, setDueOnly] = useState(false);
  const [freePractice, setFreePractice] = useState(false);
  const [showBack, setShowBack] = useState(false);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [mistakeFilter, setMistakeFilter] = useState("");
  const [allCards, setAllCards] = useState(history.allCards);
  const [allLessons, setAllLessons] = useState(history.allLessons);
  const [allMistakes, setAllMistakes] = useState(history.allMistakes);
  const [topPatterns, setTopPatterns] = useState(initialPatterns);
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizCategory, setQuizCategory] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    kind: "card" | "lesson" | "mistake";
    id: number;
  } | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const confirmationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledInitialQuery = useRef(false);

  useEffect(() => {
    setAllCards(history.allCards);
    setAllLessons(history.allLessons);
    setAllMistakes(history.allMistakes);
    setTopPatterns(initialPatterns);
  }, [history.allCards, history.allLessons, history.allMistakes, initialPatterns]);

  useEffect(() => {
    if (handledInitialQuery.current) return;
    handledInitialQuery.current = true;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "lessons") setActiveTab("lessons");
    if (params.get("quiz") === "top" && initialPatterns.length > 0) {
      setQuizCategory(initialPatterns[0].category);
      setQuizOpen(true);
    }
  }, [initialPatterns]);

  useEffect(
    () => () => {
      if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
    },
    [],
  );

  const filteredCards = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");
    return allCards.filter((card) => {
      if (dueOnly && !card.isDue) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        card.term.toLocaleLowerCase("fr").includes(query) ||
        card.translation.toLocaleLowerCase("fr").includes(query)
      );
    });
  }, [allCards, dueOnly, search]);

  const filteredMistakes = useMemo(() => {
    const query = mistakeFilter.trim().toLocaleLowerCase("fr");
    if (!query) {
      return allMistakes;
    }
    return allMistakes.filter((mistake) =>
      [
        mistake.userText,
        mistake.correction,
        mistake.category ?? "",
        mistake.explanation ?? "",
      ].some((value) => value.toLocaleLowerCase("fr").includes(query)),
    );
  }, [allMistakes, mistakeFilter]);

  const activeCard = filteredCards[practiceIndex] ?? null;

  async function deleteItem(kind: "card" | "lesson" | "mistake", id: number) {
    const key = `${kind}-${id}`;
    if (pendingDelete?.kind !== kind || pendingDelete.id !== id) {
      if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
      setPendingDelete({ kind, id });
      setDeleteError("");
      confirmationTimer.current = setTimeout(() => setPendingDelete(null), 3000);
      return;
    }

    if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
    confirmationTimer.current = null;
    setPendingDelete(null);
    setDeletingKey(key);
    setDeleteError("");
    try {
      const collection =
        kind === "card" ? "cards" : kind === "lesson" ? "lessons" : "mistakes";
      const response = await fetch(`/api/${collection}/${id}`, {
        method: "DELETE",
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          typeof body === "object" &&
            body !== null &&
            "error" in body &&
            typeof body.error === "string"
            ? body.error
            : "La suppression n’a pas abouti.",
        );
      }

      if (kind === "card") {
        setAllCards((current) => current.filter((card) => card.id !== id));
        setPracticeIndex(0);
      } else if (kind === "lesson") {
        setAllLessons((current) => current.filter((lesson) => lesson.id !== id));
      } else {
        const deleted = allMistakes.find((mistake) => mistake.id === id);
        setAllMistakes((current) => current.filter((mistake) => mistake.id !== id));
        if (deleted) {
          const key = normalizedCategory(deleted.category);
          setTopPatterns((current) =>
            current.flatMap((pattern) => {
              if (normalizedCategory(pattern.category) !== key) return [pattern];
              const count = pattern.count - 1;
              return count > 0
                ? [
                    {
                      ...pattern,
                      count,
                      examples: pattern.examples.filter((example) => example.id !== id),
                    },
                  ]
                : [];
            }),
          );
        }
      }
      router.refresh();
    } catch (caught) {
      setDeleteError(
        caught instanceof Error ? caught.message : "La suppression n’a pas abouti.",
      );
    } finally {
      setDeletingKey(null);
    }
  }

  function setTab(tab: HistoryTab) {
    setActiveTab(tab);
    setFreePractice(false);
    setSearch("");
  }

  function openPractice() {
    setPracticeIndex(0);
    setShowBack(false);
    setFreePractice(true);
  }

  function movePractice(direction: -1 | 1) {
    if (filteredCards.length === 0) {
      return;
    }
    setPracticeIndex((index) =>
      (index + direction + filteredCards.length) % filteredCards.length,
    );
    setShowBack(false);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-10 pt-6 sm:px-7 sm:pt-9">
      <header className="mb-6">
        <p className="text-sm text-zinc-400">Votre parcours, à votre rythme</p>
        <h1 className="mt-1 font-serif text-3xl tracking-[-0.04em] text-white sm:text-4xl">
          Historique & entraînement libre
        </h1>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            [`${allCards.length} cartes`, "text-amber-100"],
            [`${history.drillHistory.length} traductions`, "text-violet-100"],
            [`${allLessons.length} leçons`, "text-emerald-100"],
            [`${allMistakes.length} erreurs`, "text-rose-100"],
          ].map(([label, color]) => (
            <span
              key={label}
              className={`rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-xs ${color}`}
            >
              {label}
            </span>
          ))}
        </div>
      </header>
      {deleteError ? (
        <p role="alert" className="mb-3 rounded-xl border border-rose-300/20 bg-rose-300/[0.07] px-4 py-3 text-sm text-rose-100">
          {deleteError}
        </p>
      ) : null}

      <nav
        aria-label="Vues de l’historique"
        className="mb-3 flex flex-wrap gap-2"
      >
        {(
          [
            ["vocabulary", "Vocabulaire & Deck"],
            ["translations", "Traductions"],
            ["lessons", "Leçons & Erreurs"],
          ] as const
        ).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setTab(tab)}
            aria-pressed={activeTab === tab}
            className={`min-h-11 rounded-full border px-4 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-200 ${
              activeTab === tab
                ? "border-white bg-white text-zinc-950"
                : "border-white/[0.09] bg-white/[0.035] text-zinc-300 hover:bg-white/[0.07]"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === "vocabulary" ? (
        <section className="min-w-0 rounded-3xl border border-white/[0.08] bg-[#111114] p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <label className="block min-w-0 flex-1 text-sm font-medium text-zinc-300">
              Rechercher dans le deck
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPracticeIndex(0);
                }}
                placeholder="Mot anglais ou traduction française"
                className="mt-2 h-11 w-full rounded-xl border border-white/[0.1] bg-black/25 px-3.5 text-sm text-zinc-100 outline-none transition focus:border-violet-200/40 focus:ring-2 focus:ring-violet-200/10"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setDueOnly(false);
                  setPracticeIndex(0);
                }}
                aria-pressed={!dueOnly}
                className={`min-h-11 rounded-full border px-3.5 text-xs transition ${
                  !dueOnly
                    ? "border-white/[0.2] bg-white/[0.08] text-white"
                    : "border-white/[0.08] text-zinc-400 hover:bg-white/[0.04]"
                }`}
              >
                Toutes
              </button>
              <button
                type="button"
                onClick={() => {
                  setDueOnly(true);
                  setPracticeIndex(0);
                }}
                aria-pressed={dueOnly}
                className={`min-h-11 rounded-full border px-3.5 text-xs transition ${
                  dueOnly
                    ? "border-amber-200/20 bg-amber-200/[0.07] text-amber-100"
                    : "border-white/[0.08] text-zinc-400 hover:bg-white/[0.04]"
                }`}
              >
                À réviser
              </button>
              <button
                type="button"
                onClick={openPractice}
                disabled={filteredCards.length === 0}
                className="min-h-11 rounded-full bg-white px-4 text-xs font-medium text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Entraînement libre ({filteredCards.length} cartes)
              </button>
            </div>
          </div>

          {freePractice ? (
            <div className="mt-5 rounded-3xl border border-violet-200/[0.12] bg-black/20 p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-zinc-400">
                  Entraînement libre · {practiceIndex + 1} / {filteredCards.length}
                </p>
                <button
                  type="button"
                  onClick={() => setFreePractice(false)}
                  className="min-h-11 rounded-full px-3 text-sm text-zinc-400 hover:bg-white/[0.05] hover:text-white"
                >
                  Fermer
                </button>
              </div>
              {activeCard ? (
                <>
                  <div className="mt-6 flex min-h-40 flex-col items-center justify-center text-center">
                    <p className="text-xs text-zinc-500">
                      {showBack ? "Traduction française" : "Terme anglais"}
                    </p>
                    <p className="mt-3 max-w-3xl break-words font-serif text-3xl leading-tight text-white sm:text-4xl">
                      {showBack ? activeCard.translation : activeCard.term}
                    </p>
                    {!showBack && activeCard.phonetic ? (
                      <p className="mt-2 font-mono text-sm text-zinc-400">
                        {activeCard.phonetic}
                      </p>
                    ) : null}
                    {showBack && activeCard.mnemonic ? (
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                        {activeCard.mnemonic}
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        speak(showBack ? activeCard.translation : activeCard.term, showBack ? "fr-FR" : "en-US")
                      }
                      className="min-h-11 rounded-full border border-white/[0.1] px-4 text-sm text-zinc-200 hover:bg-white/[0.05]"
                    >
                      Écouter
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBack((visible) => !visible)}
                      className="min-h-11 rounded-full bg-white px-5 text-sm font-medium text-zinc-950 hover:bg-zinc-200"
                    >
                      {showBack ? "Voir le recto" : "Révéler la réponse"}
                    </button>
                  </div>
                  <div className="mt-4 flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => movePractice(-1)}
                      className="min-h-11 rounded-full border border-white/[0.1] px-4 text-sm text-zinc-200 hover:bg-white/[0.05]"
                    >
                      ← Précédente
                    </button>
                    <button
                      type="button"
                      onClick={() => movePractice(1)}
                      className="min-h-11 rounded-full border border-white/[0.1] px-4 text-sm text-zinc-200 hover:bg-white/[0.05]"
                    >
                      Suivante →
                    </button>
                  </div>
                  <p className="mt-3 text-center text-xs text-zinc-500">
                    Ce mode ne modifie pas vos échéances de révision.
                  </p>
                </>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 divide-y divide-white/[0.06]">
            {filteredCards.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-400">
                Aucune carte ne correspond à cette recherche.
              </p>
            ) : (
              filteredCards.map((card) => (
                <article
                  key={card.id}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="break-words font-serif text-lg text-white">
                        {card.term}
                      </h2>
                      {card.phonetic ? (
                        <span className="font-mono text-xs text-zinc-500">
                          {card.phonetic}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 break-words text-sm text-zinc-300">
                      {card.translation}
                    </p>
                    <p
                      className={`mt-2 text-xs ${
                        card.isDue ? "text-amber-100" : "text-zinc-500"
                      }`}
                    >
                      {dateLabel(card)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => speak(card.term, "en-US")}
                      aria-label={`Écouter ${card.term}`}
                      className="grid size-11 place-items-center rounded-full border border-white/[0.08] text-zinc-300 hover:bg-white/[0.05]"
                    >
                      <span aria-hidden="true">▶</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteItem("card", card.id)}
                      disabled={deletingKey === `card-${card.id}`}
                      className="min-h-11 rounded-full border border-rose-200/[0.12] px-3 text-xs text-rose-200 transition hover:bg-rose-300/[0.08] disabled:opacity-50"
                    >
                      {deletingKey === `card-${card.id}`
                        ? "Suppression…"
                        : pendingDelete?.kind === "card" && pendingDelete.id === card.id
                          ? "Supprimer ?"
                          : "Supprimer"}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      ) : null}

      {activeTab === "translations" ? (
        <section className="space-y-3">
          {history.drillHistory.length === 0 ? (
            <div className="rounded-3xl border border-white/[0.08] bg-[#111114] p-7 text-center text-sm text-zinc-400">
              Vos traductions évaluées apparaîtront ici.
            </div>
          ) : (
            history.drillHistory.map((entry) => (
              <article
                key={entry.id}
                className="min-w-0 rounded-3xl border border-white/[0.08] bg-[#111114] p-5 sm:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="min-w-0 flex-1 break-words font-serif text-lg leading-7 text-white">
                    {entry.frenchSentence || "Phrase française non disponible"}
                  </p>
                  <span className="rounded-full border border-violet-200/15 bg-violet-200/[0.06] px-3 py-1.5 text-sm font-semibold tabular-nums text-violet-100">
                    {entry.score === null ? "—" : entry.score.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}
                    <span className="ml-1 text-xs font-medium">/ 10</span>
                  </span>
                </div>
                <p className="mt-4 text-xs text-zinc-500">Votre traduction</p>
                <p className="mt-1 break-words text-sm leading-6 text-zinc-300">
                  {entry.userTranslation || "Tentative non disponible"}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <time className="text-xs text-zinc-500" dateTime={entry.createdAt}>
                    {formatDateTime(entry.createdAt)}
                  </time>
                  {entry.frenchSentence ? (
                    <Link
                      href={`/drill?retry=${encodeURIComponent(entry.frenchSentence)}`}
                      className="inline-flex min-h-11 items-center rounded-full border border-white/[0.1] bg-white/[0.035] px-4 text-sm text-zinc-100 transition hover:bg-white/[0.08]"
                    >
                      Réessayer cette phrase
                    </Link>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </section>
      ) : null}

      {activeTab === "lessons" ? (
        <>
        <section className="mb-3 rounded-3xl border border-amber-200/[0.12] bg-[#111114] p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-amber-100">Remédiation personnalisée</p>
              <h2 className="mt-1 font-serif text-2xl text-white">
                Tes pièges les plus fréquents
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Deux exemples récents par catégorie pour cibler les erreurs qui reviennent.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setQuizCategory(null);
                setQuizOpen(true);
              }}
              disabled={allMistakes.length === 0}
              className="inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Quiz global · 4 questions
            </button>
          </div>
          {topPatterns.length === 0 ? (
            <p className="mt-5 rounded-2xl border border-white/[0.06] bg-black/20 p-4 text-sm text-zinc-400">
              Les erreurs relevées pendant vos exercices apparaîtront ici.
            </p>
          ) : (
            <div className="mt-5 divide-y divide-white/[0.07]">
              {topPatterns.map((pattern) => (
                <article
                  key={normalizedCategory(pattern.category)}
                  className="flex min-w-0 flex-col gap-4 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words text-base font-semibold text-zinc-100">
                        {pattern.category}
                      </h3>
                      <span className="rounded-full border border-amber-200/15 bg-amber-200/[0.06] px-2.5 py-1 text-xs tabular-nums text-amber-100">
                        {pattern.count} occurrence{pattern.count === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {pattern.examples.map((example) => (
                        <div
                          key={example.id}
                          className="rounded-xl border border-white/[0.06] bg-black/15 px-3 py-2.5"
                        >
                          <p className="break-words text-sm text-rose-100">
                            {example.user_text}
                          </p>
                          <p className="mt-1 break-words text-sm text-emerald-100">
                            {example.correction}
                          </p>
                          {example.explanation ? (
                            <p className="mt-1 break-words text-xs leading-5 text-zinc-400">
                              {example.explanation}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setQuizCategory(pattern.category);
                      setQuizOpen(true);
                    }}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] px-4 text-sm text-zinc-100 transition hover:bg-white/[0.09] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
                  >
                    Lancer un mini-quiz (4 questions)
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="min-w-0 rounded-3xl border border-white/[0.08] bg-[#111114] p-5 sm:p-6">
            <h2 className="text-base font-semibold text-white">Leçons sauvegardées</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Retrouvez un sujet et reprenez votre lecture.
            </p>
            <ul className="mt-4 divide-y divide-white/[0.06]">
              {allLessons.length === 0 ? (
                <li className="py-6 text-sm text-zinc-400">Aucune leçon pour le moment.</li>
              ) : (
                allLessons.map((lesson) => (
                  <li key={lesson.id} className="flex min-w-0 items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-zinc-100">
                        {lesson.topic}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {lesson.cefrLevel} · {formatDate(lesson.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Link
                        href={`/lesson?id=${lesson.id}`}
                        aria-label={`Ouvrir la leçon ${lesson.topic}`}
                        className="grid size-11 place-items-center rounded-full border border-white/[0.08] text-zinc-200 hover:bg-white/[0.05]"
                      >
                        <span aria-hidden="true">→</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => void deleteItem("lesson", lesson.id)}
                        disabled={deletingKey === `lesson-${lesson.id}`}
                        className="min-h-11 rounded-full border border-rose-200/[0.12] px-3 text-xs text-rose-200 transition hover:bg-rose-300/[0.08] disabled:opacity-50"
                      >
                        {deletingKey === `lesson-${lesson.id}`
                          ? "Suppression…"
                          : pendingDelete?.kind === "lesson" && pendingDelete.id === lesson.id
                            ? "Supprimer ?"
                            : "Supprimer"}
                      </button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="min-w-0 rounded-3xl border border-white/[0.08] bg-[#111114] p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">Journal des erreurs</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Filtrez par catégorie, erreur ou correction.
                </p>
              </div>
              <label className="block min-w-0 flex-1 text-xs text-zinc-400 sm:max-w-56">
                Filtrer
                <input
                  type="search"
                  value={mistakeFilter}
                  onChange={(event) => setMistakeFilter(event.target.value)}
                  placeholder="Catégorie ou mot"
                  className="mt-1.5 h-10 w-full rounded-xl border border-white/[0.1] bg-black/25 px-3 text-sm text-zinc-100 outline-none focus:border-rose-200/40"
                />
              </label>
            </div>
            <div className="mt-4 space-y-3">
              {filteredMistakes.length === 0 ? (
                <p className="py-6 text-sm text-zinc-400">Aucune erreur correspondante.</p>
              ) : (
                filteredMistakes.map((mistake) => (
                  <article
                    key={mistake.id}
                    className="min-w-0 rounded-2xl border border-white/[0.06] bg-black/20 p-3.5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 break-words text-sm text-rose-200 line-through">
                        {mistake.userText}
                      </p>
                      {mistake.category ? (
                        <span className="rounded-full border border-amber-200/[0.1] px-2.5 py-1 text-[11px] text-amber-100">
                          {mistake.category}
                        </span>
                      ) : (
                        <span className="rounded-full border border-amber-200/[0.1] px-2.5 py-1 text-[11px] text-amber-100">
                          Général
                        </span>
                      )}
                    </div>
                    <p className="mt-2 break-words text-sm text-emerald-200">
                      {mistake.correction}
                    </p>
                    {mistake.explanation ? (
                      <p className="mt-1.5 text-xs leading-5 text-zinc-400">
                        {mistake.explanation}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <time className="text-[11px] text-zinc-500" dateTime={mistake.createdAt}>
                        {formatDateTime(mistake.createdAt)}
                      </time>
                      <button
                        type="button"
                        onClick={() => void deleteItem("mistake", mistake.id)}
                        disabled={deletingKey === `mistake-${mistake.id}`}
                        className="min-h-11 rounded-full border border-rose-200/[0.12] px-3 text-xs text-rose-200 transition hover:bg-rose-300/[0.08] disabled:opacity-50"
                      >
                        {deletingKey === `mistake-${mistake.id}`
                          ? "Suppression…"
                          : pendingDelete?.kind === "mistake" && pendingDelete.id === mistake.id
                            ? "Supprimer ?"
                            : "Supprimer"}
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
        </>
      ) : null}
      <MistakeQuizModal
        isOpen={quizOpen}
        category={quizCategory}
        onClose={() => setQuizOpen(false)}
      />
    </main>
  );
}
