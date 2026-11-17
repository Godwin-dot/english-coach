"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AudioPlayerBar } from "@/components/AudioPlayerBar";
import { LLMConfigModal } from "@/components/LLMConfigModal";
import { useSpeechEngine, type SpeechEngine } from "@/hooks/useSpeechEngine";
import { useHotkeys } from "@/hooks/useHotkeys";
import {
  splitSentencesWithOffsets,
  tokenizeTextForSpeech,
} from "@/lib/speech";
import {
  CEFRLevelSchema,
  type CEFRLevel,
  type KeywordItem,
} from "@/schemas/lesson";
import type { LessonView, RecentLesson } from "@/domain/lessons";

const cefrLevels: CEFRLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
const wordToken = /^[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*$/u;

function errorMessage(body: unknown): string {
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

function currentSentence(content: string, word: string): string {
  return (
    content
      .split(/(?<=[.!?])\s+/u)
      .find((sentence) => sentence.toLocaleLowerCase().includes(word.toLocaleLowerCase())) ??
    content.slice(0, 240)
  );
}

function InterestTag({
  interest,
  onSelect,
}: {
  interest: string;
  onSelect: (interest: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(interest)}
      className="min-h-11 rounded-full border border-white/[0.09] bg-white/[0.035] px-4 py-2 text-xs text-zinc-300 transition-colors duration-150 hover:border-amber-200/30 hover:bg-amber-200/[0.06] hover:text-amber-100 active:scale-[0.98]"
    >
      {interest}
    </button>
  );
}

function WordCard({
  word,
  engine,
  onAddToReview,
  reviewStatus,
  isAddingToReview,
}: {
  word: KeywordItem | null;
  engine: SpeechEngine;
  onAddToReview: () => void;
  reviewStatus: "added" | "already_exists" | "daily_cap_reached" | null;
  isAddingToReview: boolean;
}) {
  if (!word) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
        <p className="text-xs font-medium text-slate-400">
          Vocabulaire
        </p>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Sélectionnez un mot de la leçon pour ouvrir sa fiche détaillée.
        </p>
      </div>
    );
  }

  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl backdrop-blur-md">
      <p className="text-xs font-medium text-indigo-200">
        Fiche vocabulaire
      </p>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-2xl text-slate-50">{word.term}</h3>
          <p className="mt-1 font-mono text-xs tracking-wide text-slate-400">
            {word.phonetic}
          </p>
        </div>
        <button
          type="button"
          onClick={() => engine.speak(word.term, `lesson-word:${word.term}`)}
          aria-label={`Écouter ${word.term}`}
          className="grid size-11 shrink-0 place-items-center rounded-lg border border-slate-700 text-indigo-200 transition hover:bg-slate-800"
        >
          <span aria-hidden="true">▶</span>
        </button>
      </div>
      <p className="mt-4 text-sm font-medium text-slate-200">
        {word.translation}
      </p>
      <div className="mt-4 border-t border-slate-800 pt-4">
        <div className="flex items-start justify-between gap-3">
          <p className="font-serif text-sm italic leading-6 text-slate-300">
            “{word.example}”
          </p>
          <button
            type="button"
            onClick={() =>
              engine.speak(word.example, `lesson-example:${word.term}`)
            }
            aria-label="Écouter l’exemple en anglais"
            className="grid size-11 shrink-0 place-items-center rounded-full text-xs text-slate-400 transition hover:text-indigo-200 focus-visible:outline-2 focus-visible:outline-indigo-300"
          >
            ▶
          </button>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          {word.example_fr}
        </p>
      </div>
      <button
        type="button"
        onClick={onAddToReview}
        disabled={isAddingToReview || reviewStatus !== null}
        className="mt-5 min-h-11 w-full rounded-full border border-white/10 bg-white/[0.06] text-[13px] font-medium text-white transition-colors duration-150 hover:bg-white/[0.12] active:scale-[0.98] disabled:cursor-default disabled:hover:scale-100"
      >
        {isAddingToReview
          ? "Ajout en cours…"
          : reviewStatus === "added"
            ? "Ajoutée aux révisions ✓"
            : reviewStatus === "already_exists"
              ? "Déjà dans ton deck"
              : reviewStatus === "daily_cap_reached"
                ? "Plafond quotidien atteint"
                : "+ Ajouter aux révisions"}
      </button>
    </article>
  );
}

function Quiz({
  lesson,
  onError,
}: {
  lesson: LessonView;
  onError: (message: string) => void;
}) {
  const [answers, setAnswers] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setAnswers([]);
    setSubmitted(false);
    setScore(null);
  }, [lesson.id]);

  async function submitQuiz() {
    const correctCount = lesson.quiz.reduce(
      (total, question, index) =>
        total + (answers[index] === question.answer_index ? 1 : 0),
      0,
    );
    const quizScore = Number(
      ((correctCount / lesson.quiz.length) * 10).toFixed(2),
    );
    setScore(quizScore);
    setSubmitted(true);
    setIsSaving(true);
    onError("");

    try {
      const response = await fetch(`/api/lessons/${lesson.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: quizScore }),
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        onError(errorMessage(body));
      }
    } catch {
      onError("Le résultat n’a pas pu être enregistré.");
    } finally {
      setIsSaving(false);
    }
  }

  const allAnswered = lesson.quiz.every((_, index) =>
    Number.isInteger(answers[index]),
  );

  return (
    <section className="mt-8 border-t border-slate-800 pt-7">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-indigo-200">
            Compréhension
          </p>
          <h3 className="mt-1 font-serif text-2xl text-slate-50">
            À vous de jouer
          </h3>
        </div>
        {submitted && score !== null ? (
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-1.5 text-sm font-semibold text-emerald-200">
            {score.toLocaleString("fr-FR")} / 10
          </span>
        ) : null}
      </div>

      <div className="space-y-5">
        {lesson.quiz.map((question, questionIndex) => (
          <fieldset
            key={`${lesson.id}-${questionIndex}`}
            className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 sm:p-5"
          >
            <legend className="max-w-full px-1 text-sm font-medium leading-6 text-slate-200">
              <span className="mr-2 font-mono text-xs text-slate-500">
                0{questionIndex + 1}
              </span>
              {question.question}
            </legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {question.options.map((option, optionIndex) => {
                const isSelected = answers[questionIndex] === optionIndex;
                const isCorrect = question.answer_index === optionIndex;
                let optionStyle =
                  "border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200";
                if (!submitted && isSelected) {
                  optionStyle =
                    "border-indigo-400/50 bg-indigo-400/[0.08] text-indigo-100";
                } else if (submitted && isCorrect) {
                  optionStyle =
                    "border-emerald-400/40 bg-emerald-400/[0.07] text-emerald-100";
                } else if (submitted && isSelected && !isCorrect) {
                  optionStyle =
                    "border-rose-400/40 bg-rose-400/[0.07] text-rose-100";
                }

                return (
                  <button
                    key={`${questionIndex}-${optionIndex}`}
                    type="button"
                    disabled={submitted}
                    onClick={() =>
                      setAnswers((current) => {
                        const next = [...current];
                        next[questionIndex] = optionIndex;
                        return next;
                      })
                    }
                    className={`rounded-lg border px-3 py-2.5 text-left text-[13px] leading-5 transition disabled:cursor-default ${optionStyle}`}
                  >
                    <span className="mr-2 font-mono text-[11px] text-slate-500">
                      {String.fromCharCode(65 + optionIndex)}
                    </span>
                    {option}
                  </button>
                );
              })}
            </div>
            {submitted ? (
              <p className="mt-3 border-l-2 border-indigo-400/50 pl-3 text-xs leading-5 text-slate-400">
                {question.explanation}
              </p>
            ) : null}
          </fieldset>
        ))}
      </div>

      {!submitted ? (
        <button
          type="button"
          disabled={!allAnswered}
          onClick={() => void submitQuiz()}
          className="mt-5 h-11 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Valider mes réponses
        </button>
      ) : isSaving ? (
        <p role="status" className="mt-4 text-xs text-slate-500">
          Enregistrement du résultat…
        </p>
      ) : null}
    </section>
  );
}

function RecentLessons({
  lessons,
  activeId,
}: {
  lessons: RecentLesson[];
  activeId: number | null;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-100">
          Leçons récentes
        </h3>
        <span className="font-mono text-[11px] text-slate-500">
          {lessons.length.toString().padStart(2, "0")}
        </span>
      </div>
      {lessons.length ? (
        <ul className="space-y-1">
          {lessons.map((lesson) => (
            <li key={lesson.id}>
              <Link
                href={`/lesson?id=${lesson.id}`}
                aria-current={activeId === lesson.id ? "page" : undefined}
                className={`block rounded-lg px-3 py-2.5 transition ${
                  activeId === lesson.id
                    ? "bg-indigo-400/[0.08] text-indigo-100"
                    : "text-slate-300 hover:bg-slate-800/70"
                }`}
              >
                <span className="block truncate text-[13px] font-medium">
                  {lesson.topic}
                </span>
                <span className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                  <span>{lesson.cefrLevel}</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={lesson.createdAt}>
                    {new Intl.DateTimeFormat("fr-FR", {
                      day: "numeric",
                      month: "short",
                      timeZone: "UTC",
                    }).format(new Date(lesson.createdAt))}
                  </time>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs leading-5 text-slate-500">
          Vos leçons enregistrées apparaîtront ici.
        </p>
      )}
    </section>
  );
}

export function LessonWorkspace({
  initialLesson,
  recentLessons,
  interests,
  targetLevel,
  initialTopic,
  hasProviderKey,
  openConfigInitially,
  requestedLessonId,
}: {
  initialLesson: LessonView | null;
  recentLessons: RecentLesson[];
  interests: string[];
  targetLevel: CEFRLevel;
  initialTopic: string;
  hasProviderKey: boolean;
  openConfigInitially: boolean;
  requestedLessonId: string | null;
}) {
  const router = useRouter();
  const [lesson, setLesson] = useState(initialLesson);
  const [recent, setRecent] = useState(recentLessons);
  const [topic, setTopic] = useState(initialTopic);
  const [level, setLevel] = useState<CEFRLevel>(targetLevel);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isConfigured, setIsConfigured] = useState(hasProviderKey);
  const [translationVisible, setTranslationVisible] = useState(false);
  const [selectedWord, setSelectedWord] = useState<KeywordItem | null>(null);
  const [lookupWord, setLookupWord] = useState("");
  const [error, setError] = useState("");
  const [reviewStatus, setReviewStatus] = useState<
    "added" | "already_exists" | "daily_cap_reached" | null
  >(null);
  const [isAddingToReview, setIsAddingToReview] = useState(false);
  const speechEngine = useSpeechEngine();

  useEffect(() => {
    setLesson(initialLesson);
    setSelectedWord(null);
    setReviewStatus(null);
  }, [initialLesson?.id]);

  useEffect(() => {
    setRecent(recentLessons);
  }, [recentLessons]);

  useEffect(() => {
    setTopic(initialTopic);
  }, [initialTopic]);

  useEffect(() => {
    function handleConfigSaved(event: Event) {
      if (event instanceof CustomEvent) {
        setIsConfigured(event.detail === true);
      }
    }

    window.addEventListener(
      "english-coach:llm-config-saved",
      handleConfigSaved,
    );
    return () =>
      window.removeEventListener(
        "english-coach:llm-config-saved",
        handleConfigSaved,
      );
  }, []);

  async function generateLesson(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsGenerating(true);
    setError("");

    try {
      const response = await fetch("/api/lessons/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, cefrLevel: level }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(errorMessage(body));
      }
      const nextLesson = body as LessonView;
      setLesson(nextLesson);
      setSelectedWord(null);
      setReviewStatus(null);
      setTranslationVisible(false);
      setRecent((current) =>
        [nextLesson, ...current.filter((item) => item.id !== nextLesson.id)].slice(
          0,
          10,
        ),
      );
      setTopic("");
      router.replace(`/lesson?id=${nextLesson.id}`, { scroll: false });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "La génération de la leçon a échoué.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function selectWord(word: string) {
    const savedWord = lesson?.keywords.find(
      (item) => item.term.toLocaleLowerCase() === word.toLocaleLowerCase(),
    );
    if (savedWord) {
      setSelectedWord(savedWord);
      setLookupWord("");
      setReviewStatus(null);
      return;
    }

    if (!lesson) {
      return;
    }

    setLookupWord(word);
    setError("");
    try {
      const response = await fetch("/api/lessons/lookup-word", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word,
          contextSentence: currentSentence(lesson.content_en, word),
          cefrLevel: lesson.cefrLevel,
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(errorMessage(body));
      }
      setSelectedWord(body as KeywordItem);
      setReviewStatus(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "La fiche de ce mot n’a pas pu être chargée.",
      );
    } finally {
      setLookupWord("");
    }
  }

  async function addSelectedWordToReview() {
    if (!selectedWord || !lesson || isAddingToReview) {
      return;
    }

    setIsAddingToReview(true);
    setError("");
    setReviewStatus(null);

    try {
      const response = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          term: selectedWord.term,
          translation: selectedWord.translation,
          phonetic: selectedWord.phonetic,
          example_sentence: selectedWord.example,
          example_translation: selectedWord.example_fr,
          source_lesson_id: lesson.id,
        }),
      });
      const body: unknown = await response.json().catch(() => null);

      if (response.status === 429) {
        setReviewStatus("daily_cap_reached");
        return;
      }
      if (
        typeof body === "object" &&
        body !== null &&
        "status" in body &&
        body.status === "created"
      ) {
        setReviewStatus("added");
        return;
      }
      if (
        typeof body === "object" &&
        body !== null &&
        "status" in body &&
        body.status === "already_exists"
      ) {
        setReviewStatus("already_exists");
        return;
      }
      if (!response.ok) {
        throw new Error(errorMessage(body));
      }
      throw new Error("La réponse du serveur est invalide.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "La carte n’a pas pu être ajoutée aux révisions.",
      );
    } finally {
      setIsAddingToReview(false);
    }
  }

  const keywordTokens = new Set(
    (lesson?.keywords ?? []).flatMap((keyword) =>
      keyword.term
        .toLocaleLowerCase()
        .split(/[\s-]+/u)
        .filter(Boolean),
    ),
  );

  function renderClickableText(content: string, offset: number, sourceId: string) {
    return tokenizeTextForSpeech(content).map((token, index) => {
      if (!token.isWord || !wordToken.test(token.text)) {
        return <span key={`${index}-${token.text}`}>{token.text}</span>;
      }

      const normalized = token.text.toLocaleLowerCase();
      const isKeyword = keywordTokens.has(normalized);
      const isLookingUp = lookupWord.toLocaleLowerCase() === normalized;
      const globalStart = offset + token.startChar;
      const globalEnd = offset + token.endChar;
      const isSpeaking =
        speechEngine.activeSourceId?.startsWith(sourceId) === true &&
        speechEngine.activeCharIndex !== null &&
        speechEngine.activeCharIndex >= globalStart &&
        speechEngine.activeCharIndex < globalEnd;
      return (
        <button
          key={`${index}-${token.text}`}
          type="button"
          onClick={() => void selectWord(token.text)}
          aria-label={`Consulter le mot ${token.text}`}
          className={`rounded-sm transition focus-visible:outline-2 focus-visible:outline-indigo-300 ${
            isKeyword
              ? "font-medium text-indigo-200 underline decoration-indigo-400/50 decoration-2 underline-offset-4 hover:text-indigo-100"
              : "text-slate-200 decoration-slate-500/60 underline-offset-4 hover:text-indigo-200 hover:underline"
          } ${isLookingUp ? "animate-pulse text-indigo-300" : ""} ${
            isSpeaking ? "rounded bg-amber-400/20 px-0.5 text-white" : ""
          }`}
        >
          {token.text}
        </button>
      );
    });
  }

  const activeId = lesson?.id ?? null;
  const requestedLessonMissing =
    requestedLessonId !== null &&
    (!lesson || lesson.id.toString() !== requestedLessonId);

  useHotkeys([
    {
      key: "p",
      altKey: true,
      enabled: lesson !== null,
      action: (event) => {
        event.preventDefault();
        if (!lesson) return;
        const sourceId = `lesson:${lesson.id}:full`;
        if (speechEngine.activeSourceId === sourceId) {
          if (speechEngine.status === "playing") speechEngine.pause();
          else speechEngine.resume();
        } else {
          speechEngine.speak(lesson.content_en, sourceId);
        }
      },
    },
    {
      key: "Escape",
      enabled: selectedWord !== null || lookupWord.length > 0,
      action: () => {
        setSelectedWord(null);
        setLookupWord("");
        setReviewStatus(null);
      },
    },
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 pb-8 pt-8 sm:px-8 sm:pt-12">
      <header className="page-enter mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-sm font-medium text-indigo-200">
            Pratique guidée
          </p>
          <h1 className="mt-2 font-serif text-4xl tracking-[-0.04em] text-slate-50 sm:text-5xl">
            Une leçon, votre monde.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
            Un texte vivant, quelques mots à retenir et une courte vérification
            pour ancrer ce que vous apprenez.
          </p>
        </div>
        <span className="rounded-full border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-400">
          Niveau cible{" "}
          <span className="ml-1 font-semibold text-emerald-300">
            {targetLevel}
          </span>
        </span>
      </header>

      {!hasProviderKey ? (
        <section className="mb-6 flex flex-col gap-4 rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-amber-100">
              {isConfigured
                ? "Votre fournisseur IA est configuré."
                : "Ajoutez une clé API pour créer votre première leçon."}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Gemini ou OpenRouter. Votre clé reste sur le serveur et peut
              aussi être enregistrée dans les paramètres.
            </p>
          </div>
          <LLMConfigModal
            label="Configurer une clé API"
            initialOpen={openConfigInitially}
          />
        </section>
      ) : null}

      {requestedLessonMissing ? (
        <p
          role="status"
          className="mb-5 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] px-4 py-3 text-sm text-amber-100"
        >
          Cette leçon n’existe plus ou son identifiant est invalide. Vous pouvez
          en générer une nouvelle ou choisir une leçon récente.
        </p>
      ) : null}

      <div
        className={
          lesson
            ? ""
            : "grid items-start gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.65fr)]"
        }
      >
        <section className="page-enter rounded-3xl border border-white/[0.08] bg-[#111114] p-5 shadow-xl sm:p-7">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-indigo-400/10 text-indigo-200">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                className="size-5"
              >
                <path
                  d="M5 19.5V6.8A1.8 1.8 0 0 1 6.8 5H19v12.7H6.8A1.8 1.8 0 0 0 5 19.5Zm0 0a1.8 1.8 0 0 1 1.8-1.8H19"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <div>
              <h2 className="text-[15px] font-semibold text-slate-100">
                Créer une micro-leçon
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Un thème qui vous intéresse, à votre niveau.
              </p>
            </div>
          </div>

          <form onSubmit={generateLesson} className="space-y-4">
            <div>
              <label
                htmlFor="lesson-topic"
                className="mb-2 block text-[13px] font-medium text-slate-300"
              >
                Thème de la leçon
              </label>
              <input
                id="lesson-topic"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                minLength={2}
                maxLength={120}
                required
                placeholder="Ex. les jardins urbains, l’art de la négociation…"
                className="h-12 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-400/70 focus:ring-4 focus:ring-indigo-400/10"
              />
            </div>

            {interests.length ? (
              <div>
                <p className="mb-2 text-xs font-medium text-slate-400">
                  Vos centres d’intérêt
                </p>
                <div className="flex flex-wrap gap-2">
                  {interests.map((interest) => (
                    <InterestTag
                      key={interest}
                      interest={interest}
                      onSelect={setTopic}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-end">
              <div className="w-full sm:max-w-[180px]">
                <label
                  htmlFor="lesson-level"
                  className="mb-2 block text-[13px] font-medium text-slate-300"
                >
                  Niveau CECRL
                </label>
                <select
                  id="lesson-level"
                  value={level}
                  onChange={(event) =>
                    setLevel(CEFRLevelSchema.parse(event.target.value))
                  }
                  className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 text-sm text-slate-100 outline-none focus:border-indigo-400/70"
                >
                  {cefrLevels.map((cefrLevel) => (
                    <option key={cefrLevel} value={cefrLevel}>
                      {cefrLevel}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={isGenerating || !isConfigured}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-medium text-zinc-950 shadow-lg shadow-white/5 transition-colors duration-150 hover:bg-zinc-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto sm:w-auto"
              >
                {isGenerating ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                    />
                    Préparation…
                  </>
                ) : (
                  <>
                    Générer la leçon
                    <span aria-hidden="true">↗</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {!lesson && error ? (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-rose-400/20 bg-rose-400/[0.08] px-3.5 py-3 text-[13px] leading-5 text-rose-200"
            >
              {error}
            </p>
          ) : null}
        </section>

        {!lesson ? (
          <aside>
            <RecentLessons lessons={recent} activeId={activeId} />
          </aside>
        ) : null}
      </div>

      {lesson ? (
        <article className="page-enter-delayed mt-6 rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl sm:p-8">
          <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-indigo-400/20 bg-indigo-400/[0.08] px-2.5 py-1 text-[11px] font-semibold text-indigo-200">
                  {lesson.cefrLevel}
                </span>
                <time
                  dateTime={lesson.createdAt}
                  className="text-xs text-slate-500"
                >
                  {new Intl.DateTimeFormat("fr-FR", {
                    dateStyle: "long",
                    timeZone: "UTC",
                  }).format(new Date(lesson.createdAt))}
                </time>
              </div>
              <h2 className="mt-3 font-serif text-3xl tracking-[-0.035em] text-slate-50 sm:text-4xl">
                {lesson.topic}
              </h2>
              <p className="mt-2 text-xs text-slate-500">
                Sélectionnez un mot pour explorer son sens dans le texte.
              </p>
            </div>
            <AudioPlayerBar
              engine={speechEngine}
              text={lesson.content_en}
              sourceId={`lesson:${lesson.id}:full`}
            />
          </header>

          <div className="grid gap-8 pt-6 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div>
              <section aria-labelledby="lesson-reading-title">
                <div className="mb-3 flex items-center justify-between">
                  <h3
                    id="lesson-reading-title"
                    className="text-sm font-medium text-slate-300"
                  >
                    Lecture en anglais
                  </h3>
                  <span className="text-[11px] text-slate-600">
                    Les mots en indigo sont les mots-clés
                  </span>
                </div>
                <div className="space-y-3">
                  {splitSentencesWithOffsets(lesson.content_en).map((sentence) => {
                    const sourceId = `lesson:${lesson.id}:`;
                    const sentenceSourceId = `${sourceId}sentence:${sentence.startChar}`;
                    return (
                      <p
                        key={`${sentence.startChar}-${sentence.endChar}`}
                        className="flex items-start gap-2 font-serif text-lg leading-[1.95] text-slate-200 sm:text-[19px]"
                      >
                        <button
                          type="button"
                          aria-label={`Écouter la phrase ${sentence.text}`}
                          onClick={() =>
                            speechEngine.speak(
                              sentence.text,
                              sentenceSourceId,
                              sentence.startChar,
                            )
                          }
                          className="mt-1 grid size-11 shrink-0 place-items-center rounded-full text-sm text-slate-400 transition hover:bg-white/[0.05] hover:text-indigo-200 active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-indigo-300"
                        >
                          ▶
                        </button>
                        <span className="min-w-0">
                          {renderClickableText(
                            sentence.text,
                            sentence.startChar,
                            sourceId,
                          )}
                        </span>
                      </p>
                    );
                  })}
                </div>
              </section>

              <button
                type="button"
                aria-expanded={translationVisible}
                onClick={() => setTranslationVisible((visible) => !visible)}
                className="mt-6 text-xs font-medium text-indigo-300 transition hover:text-indigo-200"
              >
                {translationVisible
                  ? "− Masquer la traduction"
                  : "+ Afficher la traduction française"}
              </button>
              {translationVisible ? (
                <section className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 p-4 sm:p-5">
                  <p className="mb-2 text-xs font-medium text-slate-400">
                    Traduction
                  </p>
                  <p className="font-serif text-base leading-7 text-slate-300">
                    {lesson.content_fr}
                  </p>
                </section>
              ) : null}

              <Quiz lesson={lesson} onError={setError} />
            </div>

            <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
              {selectedWord ? (
                <WordCard
                  word={selectedWord}
                  engine={speechEngine}
                  reviewStatus={reviewStatus}
                  isAddingToReview={isAddingToReview}
                  onAddToReview={() => void addSelectedWordToReview()}
                />
              ) : lookupWord ? (
                <div
                  role="status"
                  className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 text-sm text-slate-400"
                >
                  Recherche de « {lookupWord} »…
                </div>
              ) : (
                <WordCard
                  word={null}
                  engine={speechEngine}
                  reviewStatus={null}
                  isAddingToReview={false}
                  onAddToReview={() => undefined}
                />
              )}
              <RecentLessons lessons={recent} activeId={activeId} />
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
                <p className="text-xs font-medium text-slate-400">
                  Mots-clés
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {lesson.keywords.map((keyword) => (
                    <button
                      key={keyword.term}
                      type="button"
                      onClick={() => void selectWord(keyword.term)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${
                        selectedWord?.term === keyword.term
                          ? "border-indigo-400/40 bg-indigo-400/10 text-indigo-200"
                          : "border-slate-700 text-slate-400 hover:border-indigo-400/30 hover:text-indigo-200"
                      }`}
                    >
                      {keyword.term}
                    </button>
                  ))}
                </div>
              </div>
              {error ? (
                <p
                  role="alert"
                  className="rounded-xl border border-rose-400/20 bg-rose-400/[0.08] px-4 py-3 text-xs leading-5 text-rose-200"
                >
                  {error}
                </p>
              ) : null}
            </aside>
          </div>
        </article>
      ) : (
        <section className="page-enter-delayed mt-6 rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 px-6 py-12 text-center">
          <p className="font-serif text-2xl text-slate-200">
            La prochaine histoire commence ici.
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            Choisissez un thème qui vous inspire. Votre leçon sera enregistrée
            pour que vous puissiez la retrouver à tout moment.
          </p>
        </section>
      )}
    </main>
  );
}
