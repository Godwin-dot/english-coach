"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppSettings } from "@/schemas/settings";
import { AppSettingsSchema } from "@/schemas/settings";
import { CEFRLevelSchema, type CEFRLevel } from "@/schemas/lesson";

const levels = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const levelDescriptions: Record<CEFRLevel, string> = {
  A1: "Premiers échanges et phrases simples.",
  A2: "Situations courantes et vocabulaire familier.",
  B1: "Autonomie dans les sujets du quotidien.",
  B2: "Échanges nuancés et sujets plus complexes.",
  C1: "Expression fluide, précise et spontanée.",
  C2: "Maîtrise fine des nuances de la langue.",
};
const interestSuggestions = [
  "Architecture logicielle",
  "Cinéma & séries",
  "Actualité internationale",
  "Littérature",
  "Business & négociation",
  "Sciences",
];
const interestLabels: Record<string, string> = {
  "Cinéma & séries": "Cinéma et séries",
  "Business & négociation": "Entreprise et négociation",
};

export function formatInterestLabel(interest: string) {
  return interestLabels[interest] ?? interest;
}
const settingControls = [
  {
    key: "dailyNewCards",
    label: "Nouveaux mots par jour",
    min: 0,
    max: 100,
  },
  {
    key: "dailyReviewCap",
    label: "Révisions quotidiennes",
    min: 0,
    max: 500,
  },
  {
    key: "weeklyGoalDays",
    label: "Jours par semaine",
    min: 1,
    max: 7,
  },
] as const;

function getErrorMessage(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }
  return "Les réglages n’ont pas pu être enregistrés.";
}

export function SettingsPanel({
  initialSettings,
  onSaved,
}: {
  initialSettings: AppSettings;
  onSaved: (settings: AppSettings) => void;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(initialSettings);
  const [interestInput, setInterestInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setDraft(initialSettings);
  }, [initialSettings]);

  useEffect(() => {
    if (!isOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
    setNotice("");
  }

  function addInterest() {
    const interest = interestInput.trim();
    if (!interest) return;
    const next = [...draft.interests, interest];
    const parsed = AppSettingsSchema.safeParse({ ...draft, interests: next });
    if (!parsed.success) {
      setError(
        next.length > 12
          ? "Vous pouvez enregistrer jusqu’à 12 centres d’intérêt."
          : "Ce centre d’intérêt existe déjà ou dépasse 60 caractères.",
      );
      return;
    }
    update("interests", parsed.data.interests);
    setInterestInput("");
  }

  function addSuggestedInterest(interest: string) {
    const parsed = AppSettingsSchema.safeParse({
      ...draft,
      interests: [...draft.interests, interest],
    });
    if (!parsed.success) {
      setError("Ce centre d’intérêt existe déjà ou vous avez atteint la limite.");
      return;
    }
    update("interests", parsed.data.interests);
  }

  function updateNumber(
    key: (typeof settingControls)[number]["key"],
    value: number,
  ) {
    const control = settingControls.find((item) => item.key === key);
    if (control) {
      update(key, Math.min(control.max, Math.max(control.min, value)));
    }
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = AppSettingsSchema.safeParse(draft);
    if (!parsed.success) {
      setError("Vérifiez les valeurs et les centres d’intérêt.");
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(getErrorMessage(body));
      const saved = AppSettingsSchema.parse(body);
      setDraft(saved);
      onSaved(saved);
      router.refresh();
      setNotice("Réglages enregistrés.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Les réglages n’ont pas pu être enregistrés.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="Ouvrir les réglages"
        onClick={() => {
          setIsOpen(true);
          setError("");
          setNotice("");
        }}
        className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] px-4 text-sm font-medium text-zinc-200 transition-colors duration-150 hover:bg-white/[0.08] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
      >
        Paramètres
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSaving) {
              setIsOpen(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-settings-title"
            className="animate-view-enter max-h-[min(90dvh,860px)] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#0A0A0A] p-5 sm:p-7"
          >
            <header className="mb-6 flex items-start justify-between gap-5">
              <div>
                <h2
                  id="app-settings-title"
                  className="text-xl font-semibold tracking-tight text-white"
                >
                  Vos réglages
                </h2>
                <p className="mt-1 text-sm leading-6 text-zinc-400">
                  Ajustez votre rythme et les thèmes proposés.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isSaving}
                aria-label="Fermer les réglages"
                className="grid size-10 shrink-0 place-items-center rounded-full border border-white/[0.08] text-lg text-zinc-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white active:scale-[0.98] disabled:opacity-50"
              >
                ×
              </button>
            </header>

            <form onSubmit={saveSettings} className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2">
                <section className="rounded-2xl border border-white/[0.08] bg-black/20 p-4 sm:p-5 md:row-span-2">
                  <p className="text-sm font-medium text-amber-100">
                    Niveau et centres d’intérêt
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">
                    Un parcours adapté à ce que vous aimez apprendre.
                  </p>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {levels.map((level) => (
                      <button
                        key={level}
                        type="button"
                        aria-pressed={draft.targetLevel === level}
                        onClick={() =>
                          update("targetLevel", CEFRLevelSchema.parse(level))
                        }
                        className={`min-h-11 rounded-xl border text-sm font-semibold transition-all duration-150 active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 ${
                          draft.targetLevel === level
                            ? "border-amber-200/30 bg-amber-200/[0.09] text-amber-100"
                            : "border-white/[0.08] bg-white/[0.025] text-zinc-400 hover:bg-white/[0.06]"
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 min-h-10 text-sm leading-5 text-zinc-300">
                    {levelDescriptions[draft.targetLevel]}
                  </p>

                  <label
                    htmlFor="settings-interest"
                    className="mt-4 block text-sm font-medium text-zinc-200"
                  >
                    Centres d’intérêt
                  </label>
                  <div className="mt-2 flex gap-2">
                    <input
                      id="settings-interest"
                      value={interestInput}
                      maxLength={60}
                      onChange={(event) => setInterestInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addInterest();
                        }
                      }}
                      placeholder="Ajouter un thème"
                      className="h-11 min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-zinc-950 px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-amber-200/50 focus:ring-2 focus:ring-amber-200/10"
                    />
                    <button
                      type="button"
                      onClick={addInterest}
                      className="min-h-11 rounded-full border border-white/[0.1] px-4 text-sm text-zinc-200 transition-all duration-150 hover:bg-white/[0.06] active:scale-[0.985]"
                    >
                      Ajouter
                    </button>
                  </div>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {draft.interests.map((interest) => (
                      <li key={interest}>
                        <button
                          type="button"
                          onClick={() =>
                            update(
                              "interests",
                              draft.interests.filter((item) => item !== interest),
                            )
                          }
                          aria-label={`Retirer ${formatInterestLabel(interest)}`}
                          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.04] px-3 text-xs text-zinc-300 transition-all duration-150 hover:border-rose-300/30 hover:text-rose-100 active:scale-[0.985]"
                        >
                          {formatInterestLabel(interest)}
                          <span aria-hidden="true">×</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-xs text-zinc-500">Suggestions rapides</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {interestSuggestions.map((interest) => {
                      const selected = draft.interests.some(
                        (item) =>
                          formatInterestLabel(item).toLocaleLowerCase("fr") ===
                          formatInterestLabel(interest).toLocaleLowerCase("fr"),
                      );
                      return (
                        <button
                          key={interest}
                          type="button"
                          disabled={selected}
                          onClick={() => addSuggestedInterest(interest)}
                          className="min-h-10 rounded-full border border-white/[0.08] bg-white/[0.025] px-3 text-xs text-zinc-300 transition-all duration-150 hover:bg-white/[0.07] active:scale-[0.985] disabled:cursor-default disabled:opacity-40"
                        >
                          {formatInterestLabel(interest)}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-2xl border border-white/[0.08] bg-black/20 p-4 sm:p-5">
                  <p className="text-sm font-medium text-violet-100">
                    Rythme et objectifs quotidiens
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">
                    Ajustez votre charge de pratique sans perdre le fil.
                  </p>
                  <div className="mt-4 space-y-4">
                    {settingControls.map(({ key, label, min, max }) => (
                      <div key={key}>
                        <div className="flex items-center justify-between gap-3">
                          <label
                            htmlFor={`settings-${key}`}
                            className="min-w-0 text-xs font-medium text-zinc-300"
                          >
                            {label}
                          </label>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              aria-label={`Diminuer ${label.toLocaleLowerCase("fr")}`}
                              onClick={() => updateNumber(key, draft[key] - 1)}
                              disabled={draft[key] <= min}
                              className="grid size-9 place-items-center rounded-full border border-white/[0.08] text-zinc-300 transition-all duration-150 hover:bg-white/[0.07] active:scale-[0.985] disabled:opacity-35"
                            >
                              −
                            </button>
                            <span className="w-9 text-center text-sm font-semibold tabular-nums text-white">
                              {Number.isFinite(draft[key]) ? draft[key] : "Non défini"}
                            </span>
                            <button
                              type="button"
                              aria-label={`Augmenter ${label.toLocaleLowerCase("fr")}`}
                              onClick={() => updateNumber(key, draft[key] + 1)}
                              disabled={draft[key] >= max}
                              className="grid size-9 place-items-center rounded-full border border-white/[0.08] text-zinc-300 transition-all duration-150 hover:bg-white/[0.07] active:scale-[0.985] disabled:opacity-35"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        <input
                          id={`settings-${key}`}
                          type="range"
                          min={min}
                          max={max}
                          step={1}
                          value={Number.isFinite(draft[key]) ? draft[key] : min}
                          onChange={(event) =>
                            updateNumber(key, Number(event.target.value))
                          }
                          className="mt-2 h-2 w-full cursor-pointer accent-amber-200"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5 text-sm text-zinc-300">
                    Temps estimé :{" "}
                    <span className="font-semibold tabular-nums text-white">
                      ~{Math.max(
                        1,
                        Math.round(
                          (Math.max(0, draft.dailyNewCards) * 50 +
                            Math.max(0, draft.dailyReviewCap) * 15) /
                            60,
                        ),
                      )}{" "}
                      min / jour
                    </span>
                  </p>
                </section>

                <section className="rounded-2xl border border-white/[0.08] bg-black/20 p-4 sm:p-5 md:col-span-2">
                  <p className="text-sm font-medium text-emerald-100">
                    Données et sauvegardes
                  </p>
                  <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="max-w-2xl text-xs leading-5 text-zinc-400">
                      Exportez vos cartes, leçons, erreurs et préférences. Les clés API restent exclues du fichier.
                    </p>
                    <a
                      href="/api/export"
                      className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.05] px-4 text-sm text-zinc-100 transition-all duration-150 hover:bg-white/[0.1] active:scale-[0.985]"
                    >
                      Exporter mes données (.json)
                    </a>
                  </div>
                </section>
              </div>

              {error ? (
                <p
                  role="alert"
                  className="rounded-xl border border-rose-300/20 bg-rose-300/[0.07] px-4 py-3 text-sm text-rose-100"
                >
                  {error}
                </p>
              ) : null}
              {notice ? (
                <p
                  role="status"
                  className="rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] px-4 py-3 text-sm text-emerald-100"
                >
                  {notice}
                </p>
              ) : null}

              <footer className="flex justify-end border-t border-white/[0.08] pt-5">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-medium text-zinc-950 transition-colors duration-150 hover:bg-zinc-200 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
                >
                  {isSaving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
