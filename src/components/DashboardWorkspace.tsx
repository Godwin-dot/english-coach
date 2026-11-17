"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ActivityHeatmap } from "@/components/ActivityHeatmap";
import {
  formatInterestLabel,
  SettingsPanel,
} from "@/components/SettingsPanel";
import type { DashboardStats } from "@/domain/stats";
import type { AppSettings } from "@/schemas/settings";

function countLabel(value: number, singular: string, plural: string) {
  return (
    <>
      <span className="tabular-nums">{value}</span>{" "}
      {value === 1 ? singular : plural}
    </>
  );
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
  const { deckBreakdown, recentAverageScore } = stats;
  const deckSegments = [
    { key: "fresh", label: "Nouvelles", value: deckBreakdown.fresh, color: "bg-zinc-500" },
    { key: "learning", label: "En cours", value: deckBreakdown.learning, color: "bg-amber-300" },
    { key: "mastered", label: "Maîtrisées", value: deckBreakdown.mastered, color: "bg-emerald-300" },
  ];
  const scoreDeltaLabel =
    recentAverageScore.delta === null
      ? "Pas encore assez d’évaluations pour comparer"
      : Math.abs(recentAverageScore.delta) < 0.05
        ? "Stable par rapport aux précédentes"
        : `${recentAverageScore.delta > 0 ? "↗ +" : "↘ -"}${Math.abs(
            recentAverageScore.delta,
          ).toLocaleString("fr-FR", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })} point${Math.abs(recentAverageScore.delta) === 1 ? "" : "s"}`;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-10 pt-6 sm:px-7 sm:pt-9">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-sm tabular-nums text-zinc-400">{dateLabel}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#EDEDED] sm:text-3xl">
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
        <article className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0A0A0A] p-5 sm:p-7">
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-medium text-zinc-300">À réviser</h2>
              <p className="mt-4 font-mono text-4xl leading-none tracking-tight tabular-nums text-[#EDEDED] sm:text-5xl">
                {reviewableCards}
              </p>
              <p className="mt-3 text-sm text-zinc-400">
                {reviewableCards
                  ? countLabel(reviewableCards, "carte disponible", "cartes disponibles")
                  : stats.totalDueCards
                    ? "Votre plafond quotidien est atteint."
                    : "Aucune carte à revoir pour le moment."}
              </p>
              {stats.totalDueCards > reviewableCards ? (
                <p className="mt-1 text-xs text-zinc-500">
                  <span className="tabular-nums">
                    {stats.totalDueCards - reviewableCards}
                  </span>{" "}
                  carte
                  {stats.totalDueCards - reviewableCards === 1 ? "" : "s"} restante
                  {stats.totalDueCards - reviewableCards === 1 ? "" : "s"} au-delà du plafond quotidien.
                </p>
              ) : null}
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-[#111111] px-4 py-3 text-right">
              <p className="text-xs text-zinc-500">Déjà révisées</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#EDEDED]">
                {stats.reviewsToday}
              </p>
              <p className="text-xs text-zinc-500">aujourd’hui</p>
            </div>
          </div>
          <div className="relative mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/session"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#EDEDED] px-5 text-sm font-medium text-[#0A0A0A] transition-colors duration-150 hover:bg-white active:scale-[0.98]"
            >
              Démarrer ma session de 10 min
            </Link>
            {reviewableCards > 0 ? (
              <Link
                href="/review"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/[0.12] bg-[#0A0A0A] px-5 text-sm font-medium text-zinc-100 transition-colors duration-150 hover:border-white/[0.22] hover:bg-[#141414] active:scale-[0.98]"
              >
                Continuer les révisions
              </Link>
            ) : (
              <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 text-sm text-zinc-300">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-400" />
                {stats.totalDueCards ? "Plafond atteint" : "Tout est à jour"}
              </span>
            )}
          </div>
        </article>

        <article className="flex flex-col justify-between rounded-3xl border border-white/[0.08] bg-[#0A0A0A] p-5 sm:p-7">
          <div>
            <h2 className="text-sm font-medium text-zinc-300">Nouvelle leçon</h2>
            <p className="mt-4 text-2xl font-semibold tracking-tight text-white">
              {stats.lessonsCompletedToday
                ? countLabel(
                    stats.lessonsCompletedToday,
                    "leçon terminée aujourd’hui",
                    "leçons terminées aujourd’hui",
                  )
                : "Choisissez un sujet"}
            </p>
            <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-400">
              <span className="tabular-nums">{stats.newCardsToday}</span> /{" "}
              <span className="tabular-nums">{appSettings.dailyNewCards}</span>{" "}
              mots ajoutés
              aujourd’hui.
            </p>
          </div>
          <Link
            href="/lesson"
            className="mt-6 inline-flex min-h-11 w-fit items-center justify-center rounded-full border border-white/[0.12] bg-[#0A0A0A] px-5 text-sm font-medium text-zinc-100 transition-colors duration-150 hover:border-white/[0.22] hover:bg-[#141414] active:scale-[0.98]"
          >
            Créer une micro-leçon
          </Link>
        </article>
      </section>

      <Link
        href="/drill"
        className="group mt-3 flex min-h-20 flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/[0.08] bg-[#0A0A0A] px-5 py-4 transition-colors duration-150 hover:border-white/[0.18] hover:bg-[#111111] sm:px-7"
      >
        <span className="flex items-center gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/[0.04] text-zinc-300">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 5h10M9 3v2c0 4-2 7-5 9m2-5c1.2 1.7 2.8 3 4.5 4" />
              <path d="M13 18h8m-7-3 3-7 3 7m-5-2h4" />
            </svg>
          </span>
          <span>
            <span className="block text-sm font-medium text-zinc-100">
              Traduction FR → EN
            </span>
            <span className="mt-1 block text-sm text-zinc-400">
              Entraînez-vous à produire vos mots et expressions.
              {mistakeCount > 0
                ? <> <span className="tabular-nums">{mistakeCount}</span> point{mistakeCount === 1 ? "" : "s"} de vigilance ciblé{mistakeCount === 1 ? "" : "s"}.</>
                : ""}
            </span>
          </span>
        </span>
        <span className="ml-auto inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-medium text-zinc-950 transition group-hover:bg-zinc-200">
          S’entraîner <span aria-hidden="true" className="ml-2">→</span>
        </span>
      </Link>

      <Link
        href="/chat"
        className="group mt-3 flex min-h-20 flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/[0.08] bg-[#0A0A0A] px-5 py-4 transition-colors duration-150 hover:border-white/[0.18] hover:bg-[#111111] sm:px-7"
      >
        <span className="flex items-center gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/[0.04] text-zinc-300">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6.5A7.5 7.5 0 0 1 10.5 7H12" />
              <path d="M15.5 3.5h5m-2.5-2.5v5" />
              <path d="M7.5 12h.01M11 12h.01M14.5 12h.01" />
            </svg>
          </span>
          <span>
            <span className="block text-sm font-medium text-zinc-100">
              Conversation en anglais
            </span>
            <span className="mt-1 block text-sm text-zinc-400">
              Jouez un rôle et recevez un coaching personnalisé en direct.
            </span>
          </span>
        </span>
        <span className="ml-auto inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-medium text-zinc-950 transition group-hover:bg-zinc-200">
          Démarrer <span aria-hidden="true" className="ml-2">→</span>
        </span>
      </Link>

      {mistakeCount >= 2 ? (
        <Link
          href="/history?tab=lessons&quiz=top"
          className="group mt-3 flex min-h-16 flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/[0.08] bg-[#0A0A0A] px-5 py-4 transition-colors duration-150 hover:border-white/[0.18] hover:bg-[#111111] sm:px-7"
        >
          <span>
            <span className="block text-sm font-medium text-zinc-200">
              Point de vigilance
            </span>
            <span className="mt-1 block text-sm text-zinc-400">
              <span className="tabular-nums">{mistakeCount}</span> erreurs
              enregistrées : révisez les pièges qui reviennent.
            </span>
          </span>
          <span className="ml-auto inline-flex min-h-11 items-center rounded-full border border-white/[0.1] bg-white/[0.05] px-4 text-sm text-zinc-100 transition group-hover:bg-white/[0.1]">
            Quiz ciblé <span aria-hidden="true" className="ml-2">→</span>
          </span>
        </Link>
      ) : null}

      <section
        aria-label="Activité et progression du vocabulaire"
        className="mt-3 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.8fr)]"
      >
        <ActivityHeatmap
          days={stats.heatmap84d}
          activeDays={stats.activeDays84d}
        />

        <article className="min-w-0 rounded-3xl border border-white/[0.08] bg-[#0A0A0A] p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-[#EDEDED]">
                Vocabulaire et progression
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Répartition des cartes et évolution des scores.
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300">
              <span className="font-mono tabular-nums">{deckBreakdown.total}</span>{" "}
              cartes
            </span>
          </div>

          <div
            role="img"
            aria-label={deckSegments
              .map(({ label, value }) => `${label}: ${value}`)
              .join(", ")}
            className="mt-6 flex h-3 overflow-hidden rounded-full bg-white/[0.05]"
          >
            {deckSegments.map((segment) => (
              <span
                key={segment.key}
                className={`h-full ${segment.color}`}
                style={{
                  width:
                    deckBreakdown.total > 0
                      ? `${(segment.value / deckBreakdown.total) * 100}%`
                      : "0%",
                }}
              />
            ))}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {deckSegments.map((segment) => (
              <div key={segment.key} className="min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] leading-4 text-zinc-400">
                  <span className={`size-2 shrink-0 rounded-full ${segment.color}`} />
                  <span className="truncate">{segment.label}</span>
                </p>
                <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-[#EDEDED]">
                  {segment.value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-white/[0.07] pt-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs text-zinc-400">Moyenne des évaluations récentes</p>
                <p className="mt-1 font-mono text-3xl font-semibold tabular-nums tracking-tight text-[#EDEDED]">
                  {recentAverageScore.currentAvg === null
                    ? "Pas encore"
                    : `${recentAverageScore.currentAvg.toLocaleString("fr-FR", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })} / 10`}
                </p>
              </div>
              <p
                className={`text-right text-xs tabular-nums ${
                  recentAverageScore.delta === null
                    ? "text-zinc-500"
                    : recentAverageScore.delta > 0
                      ? "text-emerald-200"
                      : recentAverageScore.delta < 0
                        ? "text-amber-200"
                        : "text-zinc-400"
                }`}
              >
                {scoreDeltaLabel}
              </p>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              <span className="font-mono tabular-nums">{recentAverageScore.sampleCount}</span>{" "}
              / 10 dernières évaluations
            </p>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/[0.08] bg-[#111111] px-4 py-3">
            <span className="text-sm text-zinc-400">Étude, 7 derniers jours</span>
            <span className="font-mono text-sm font-semibold tabular-nums text-[#EDEDED]">
              {stats.weeklyStudyMinutes} min
            </span>
          </div>
        </article>
      </section>

      <section
        aria-labelledby="weekly-progress-title"
        className="mt-3 rounded-3xl border border-white/[0.08] bg-[#0A0A0A] p-5 sm:p-7"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2
              id="weekly-progress-title"
              className="text-lg font-semibold tracking-tight text-[#EDEDED]"
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
            <span className="font-mono font-semibold tabular-nums text-[#EDEDED]">
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
                  ? "border-white/[0.18] bg-white/[0.07] text-[#EDEDED]"
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
          {countLabel(stats.totalCards, "carte dans votre collection", "cartes dans votre collection")}
          {" · "}objectif de{" "}
          <span className="font-mono tabular-nums">{appSettings.weeklyGoalDays}</span> jours
          par semaine
        </p>
      </section>

      {appSettings.interests.length ? (
        <section
          aria-labelledby="interests-title"
          className="mt-3 rounded-3xl border border-white/[0.08] bg-[#0A0A0A] p-5 sm:p-7"
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
                href={`/lesson?topic=${encodeURIComponent(formatInterestLabel(interest))}`}
                className="inline-flex min-h-10 items-center rounded-full border border-white/[0.12] bg-[#0A0A0A] px-4 text-sm text-zinc-300 transition-colors duration-150 hover:border-white/[0.22] hover:bg-[#141414] hover:text-[#EDEDED] active:scale-[0.98]"
              >
                {formatInterestLabel(interest)}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
