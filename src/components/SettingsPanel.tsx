"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppSettings } from "@/schemas/settings";
import { AppSettingsSchema } from "@/schemas/settings";
import { CEFRLevelSchema } from "@/schemas/lesson";

const levels = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

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
            className="max-h-[min(90dvh,760px)] w-full max-w-xl overflow-y-auto rounded-3xl border border-white/[0.09] bg-[#111114] p-5 shadow-2xl sm:p-7"
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

            <form onSubmit={saveSettings} className="space-y-6">
              <div>
                <label
                  htmlFor="settings-level"
                  className="mb-2 block text-sm font-medium text-zinc-200"
                >
                  Niveau cible
                </label>
                <select
                  id="settings-level"
                  value={draft.targetLevel}
                  onChange={(event) =>
                    update(
                      "targetLevel",
                      CEFRLevelSchema.parse(event.target.value),
                    )
                  }
                  className="h-11 w-full rounded-xl border border-white/[0.1] bg-zinc-950 px-3 text-sm text-white outline-none focus:border-amber-200/50 focus:ring-2 focus:ring-amber-200/10"
                >
                  {levels.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {(
                  [
                    ["dailyNewCards", "Nouveaux mots", 100],
                    ["dailyReviewCap", "Révisions max.", 500],
                    ["weeklyGoalDays", "Jours par semaine", 7],
                  ] as const
                ).map(([key, label, max]) => (
                  <div key={key}>
                    <label
                      htmlFor={`settings-${key}`}
                      className="mb-2 block text-sm font-medium text-zinc-300"
                    >
                      {label}
                    </label>
                    <input
                      id={`settings-${key}`}
                      type="number"
                      min={key === "weeklyGoalDays" ? 1 : 0}
                      max={max}
                      step={1}
                      required
                      value={draft[key]}
                      onChange={(event) =>
                        update(
                          key,
                          event.target.value === ""
                            ? Number.NaN
                            : Number(event.target.value),
                        )
                      }
                      className="h-11 w-full rounded-xl border border-white/[0.1] bg-zinc-950 px-3 text-sm tabular-nums text-white outline-none focus:border-amber-200/50 focus:ring-2 focus:ring-amber-200/10"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label
                  htmlFor="settings-interest"
                  className="mb-2 block text-sm font-medium text-zinc-200"
                >
                  Centres d’intérêt
                </label>
                <div className="flex gap-2">
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
                    className="min-h-11 rounded-full border border-white/[0.1] px-4 text-sm text-zinc-200 transition-colors duration-150 hover:bg-white/[0.06] active:scale-[0.98]"
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
                        aria-label={`Retirer ${interest}`}
                        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.04] px-3 text-xs text-zinc-300 transition-colors duration-150 hover:border-rose-300/30 hover:text-rose-100 active:scale-[0.98]"
                      >
                        {interest}
                        <span aria-hidden="true">×</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <section className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                <h3 className="text-sm font-medium text-zinc-100">
                  Sauvegarde des données
                </h3>
                <p className="mt-1 text-xs leading-5 text-zinc-400">
                  Téléchargez vos données pédagogiques. Les clés API ne sont jamais exportées.
                </p>
                <a
                  href="/api/export"
                  className="mt-3 inline-flex min-h-11 items-center rounded-full border border-white/[0.1] bg-white/[0.05] px-4 text-sm text-zinc-100 transition-colors duration-150 hover:bg-white/[0.1]"
                >
                  Exporter mes données (.json)
                </a>
              </section>

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
