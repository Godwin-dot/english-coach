"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SettingsPanel } from "@/components/SettingsPanel";
import type { DashboardStats } from "@/domain/stats";
import type { AppSettings } from "@/schemas/settings";

function pluralize(value: number, singular: string, plural: string) {
  return `${value} ${value === 1 ? singular : plural}`;
}

export function DashboardWorkspace({
  initialSettings,
  stats,
  dateLabel,
  mistakeCount,
}: {
  initialSettings: AppSettings;
  stats: DashboardStats;
  dateLabel: string;
  mistakeCount: number;
}) {
  const [appSettings, setAppSettings] = useState(initialSettings);

  useEffect(() => setAppSettings(initialSettings), [initialSettings]);

  const weeklyGoalReached = stats.activeDaysThisWeek >= appSettings.weeklyGoalDays;
  const reviewableCards = Math.min(stats.totalDueCards, appSettings.dailyReviewCap);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-10 pt-6 sm:px-7 sm:pt-9">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-400">{dateLabel}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
            Votre pratique
          </h1>
        </div>
        <SettingsPanel
          initialSettings={appSettings}
          onSaved={(saved) => {
            setAppSettings(saved);
          }}
        />
      </header>

      <section
        aria-label="Actions du jour"
        className="grid gap-3 lg:grid-cols-[1.35fr_0.85fr]"
      >
        <article className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#111114] p-5 sm:p-7">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-32 size-80 rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.12),transparent_68%)]"
          />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-medium text-zinc-300">À réviser</h2>
              <p className="mt-4 font-serif text-6xl leading-none tracking-[-0.06em] tabular-nums text-white sm:text-7xl">
                {reviewableCards}
              </p>
              <p className="mt-3 text-sm text-zinc-400">
                {reviewableCards
                  ? pluralize(reviewableCards, "carte disponible", "cartes disponibles")
                  : stats.totalDueCards
                    ? "Votre plafond quotidien est atteint."
                    : "Aucune carte à revoir pour le moment."}
              </p>
              {stats.totalDueCards > reviewableCards ? (
                <p className="mt-1 text-xs text-zinc-500">
                  {stats.totalDueCards - reviewableCards} carte
                  {stats.totalDueCards - reviewableCards === 1 ? "" : "s"} restante
                  {stats.totalDueCards - reviewableCards === 1 ? "" : "s"} au-delà du plafond quotidien.
                </p>
              ) : null}
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-3 text-right">
              <p className="text-xs text-zinc-500">Déjà révisées</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-white">
                {stats.reviewsToday}
              </p>
              <p className="text-xs text-zinc-500">aujourd’hui</p>
            </div>
          </div>
          <div className="relative mt-7 flex flex-wrap items-center gap-3">
            {reviewableCards > 0 ? (
              <Link
                href="/review"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-medium text-zinc-950 transition-colors duration-150 hover:bg-zinc-200 active:scale-[0.98]"
              >
                Continuer les révisions
              </Link>
            ) : (
              <span className="inline-flex min-h-11 items-center rounded-full border border-emerald-300/20 bg-emerald-300/[0.07] px-4 text-sm text-emerald-100">
                {stats.totalDueCards ? "Plafond atteint" : "Tout est à jour"}
              </span>
            )}
          </div>
        </article>

        <article className="flex flex-col justify-between rounded-3xl border border-white/[0.08] bg-[#111114] p-5 sm:p-7">
          <div>
            <h2 className="text-sm font-medium text-zinc-300">Nouvelle leçon</h2>
            <p className="mt-4 text-2xl font-semibold tracking-tight text-white">
              {stats.lessonsCompletedToday
                ? pluralize(
                    stats.lessonsCompletedToday,
                    "leçon terminée aujourd’hui",
                    "leçons terminées aujourd’hui",
                  )
                : "Choisissez un sujet"}
            </p>
            <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-400">
              {stats.newCardsToday} / {appSettings.dailyNewCards} mots ajoutés
              aujourd’hui.
            </p>
          </div>
          <Link
            href="/lesson"
            className="mt-6 inline-flex min-h-11 w-fit items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] px-5 text-sm font-medium text-zinc-100 transition-colors duration-150 hover:bg-white/[0.09] active:scale-[0.98]"
          >
            Créer une micro-leçon
          </Link>
        </article>
      </section>

      <Link
        href="/drill"
        className="group mt-3 flex min-h-20 flex-wrap items-center justify-between gap-4 rounded-3xl border border-violet-300/[0.14] bg-[#111114] px-5 py-4 transition-colors duration-150 hover:border-violet-300/30 hover:bg-white/[0.035] sm:px-7"
      >
        <span className="flex items-center gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-violet-300/[0.09] text-violet-200">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 5h10M9 3v2c0 4-2 7-5 9m2-5c1.2 1.7 2.8 3 4.5 4" />
              <path d="M13 18h8m-7-3 3-7 3 7m-5-2h4" />
            </svg>
          </span>
          <span>
            <span className="block text-sm font-medium text-zinc-100">
              Traduction active FR → EN
            </span>
            <span className="mt-1 block text-sm text-zinc-400">
              Entraînez-vous à produire vos mots et expressions.
              {mistakeCount > 0
                ? ` ${mistakeCount} point${mistakeCount === 1 ? "" : "s"} de vigilance ciblé${mistakeCount === 1 ? "" : "s"}.`
                : ""}
            </span>
          </span>
        </span>
        <span className="ml-auto inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-medium text-zinc-950 transition group-hover:bg-zinc-200">
          S’entraîner <span aria-hidden="true" className="ml-2">→</span>
        </span>
      </Link>

      <section
        aria-labelledby="weekly-progress-title"
        className="mt-3 rounded-3xl border border-white/[0.08] bg-[#111114] p-5 sm:p-7"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2
              id="weekly-progress-title"
              className="text-lg font-semibold tracking-tight text-white"
            >
              Votre semaine
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              {weeklyGoalReached
                ? "Objectif hebdomadaire atteint."
                : "Jours avec une leçon terminée ou une révision enregistrée."}
            </p>
          </div>
          <p className="text-sm text-zinc-300">
            <span className="font-semibold tabular-nums text-white">
              {stats.activeDaysThisWeek}
            </span>{" "}
            / {appSettings.weeklyGoalDays} jours
          </p>
        </div>
        <div className="mt-5 grid grid-cols-7 gap-2">
          {stats.weeklyDays.map((day) => (
            <div
              key={day.date}
              role="img"
              aria-label={`${day.label}${day.isToday ? ", aujourd’hui" : ""}: ${
                day.active ? "activité enregistrée" : "aucune activité"
              }`}
              className={`flex min-h-[68px] flex-col items-center justify-center gap-2 rounded-2xl border text-xs transition-colors duration-150 ${
                day.isToday
                  ? "border-white/[0.18] bg-white/[0.07] text-white"
                  : "border-white/[0.06] bg-black/15 text-zinc-500"
              }`}
            >
              <span>{day.label}</span>
              <span
                aria-hidden="true"
                className={`size-2 rounded-full ${
                  day.active ? "bg-emerald-300" : "bg-white/[0.12]"
                }`}
              />
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-zinc-500">
          {pluralize(stats.totalCards, "carte dans votre deck", "cartes dans votre deck")}
          {" · "}objectif de {appSettings.weeklyGoalDays} jours par semaine
        </p>
      </section>

      {appSettings.interests.length ? (
        <section
          aria-labelledby="interests-title"
          className="mt-3 rounded-3xl border border-white/[0.08] bg-[#111114] p-5 sm:p-7"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="interests-title"
                className="text-lg font-semibold tracking-tight text-white"
              >
                Thèmes à explorer
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Choisissez un thème pour préparer une leçon.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {appSettings.interests.map((interest) => (
              <Link
                key={interest}
                href={`/lesson?topic=${encodeURIComponent(interest)}`}
                className="inline-flex min-h-10 items-center rounded-full border border-white/[0.09] bg-white/[0.035] px-4 text-sm text-zinc-300 transition-colors duration-150 hover:border-amber-200/25 hover:bg-amber-200/[0.06] hover:text-amber-100 active:scale-[0.98]"
              >
                {interest}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
