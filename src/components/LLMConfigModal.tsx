"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ProviderName = "gemini" | "openrouter";

type PublicLLMConfig = {
  provider: ProviderName;
  model: string;
  openrouterModel: string;
  hasGeminiKey: boolean;
  geminiKeyMask: string | null;
  hasOpenrouterKey: boolean;
  openrouterKeyMask: string | null;
};

type LLMConfigModalProps = {
  initialOpen?: boolean;
  label?: string;
  displayLabel?: string;
  buttonClassName?: string;
};

const modelSuggestions: Record<ProviderName, string[]> = {
  gemini: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
  openrouter: ["google/gemini-2.5-flash", "google/gemini-2.5-flash-lite"],
};

async function readError(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
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

export function LLMConfigModal({
  initialOpen = false,
  label = "Configurer l’IA",
  displayLabel = "IA",
  buttonClassName = "flex h-9 items-center gap-2 rounded-full border border-white/[0.1] px-3 text-xs font-medium text-zinc-300 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white sm:px-3",
}: LLMConfigModalProps) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [portalReady, setPortalReady] = useState(false);
  const [config, setConfig] = useState<PublicLLMConfig | null>(null);
  const [provider, setProvider] = useState<ProviderName>("gemini");
  const [model, setModel] = useState("");
  const [openrouterModel, setOpenrouterModel] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [openrouterApiKey, setOpenrouterApiKey] = useState("");
  const [busy, setBusy] = useState<"load" | "save" | "test" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const loadConfig = useCallback(async () => {
    setBusy("load");
    setError("");
    try {
      const response = await fetch("/api/settings/llm", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      const nextConfig = (await response.json()) as PublicLLMConfig;
      setConfig(nextConfig);
      setProvider(nextConfig.provider);
      setModel(nextConfig.model);
      setOpenrouterModel(nextConfig.openrouterModel);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible de charger la configuration.",
      );
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    if (initialOpen) {
      setIsOpen(true);
      void loadConfig();
    }
  }, [initialOpen, loadConfig]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  function openModal() {
    setIsOpen(true);
    setNotice("");
    void loadConfig();
  }

  function closeModal() {
    setIsOpen(false);
    setError("");
    setNotice("");
    setGeminiApiKey("");
    setOpenrouterApiKey("");
  }

  async function saveConfig(
    options: {
      clearGeminiApiKey?: boolean;
      clearOpenrouterApiKey?: boolean;
    } = {},
  ): Promise<PublicLLMConfig | null> {
    setBusy("save");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/settings/llm", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          openrouterModel,
          geminiApiKey,
          openrouterApiKey,
          ...options,
        }),
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      const nextConfig = (await response.json()) as PublicLLMConfig;
      setConfig(nextConfig);
      setModel(nextConfig.model);
      setOpenrouterModel(nextConfig.openrouterModel);
      setGeminiApiKey("");
      setOpenrouterApiKey("");
      setNotice(
        options.clearGeminiApiKey || options.clearOpenrouterApiKey
          ? "Clé effacée."
          : "Configuration enregistrée. Les clés restent privées.",
      );
      window.dispatchEvent(
        new CustomEvent("english-coach:llm-config-saved", {
          detail: nextConfig.hasGeminiKey || nextConfig.hasOpenrouterKey,
        }),
      );
      return nextConfig;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Impossible d'enregistrer la configuration.",
      );
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    const savedConfig = await saveConfig();
    if (!savedConfig) {
      return;
    }

    setBusy("test");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/settings/llm/test", {
        method: "POST",
      });
      const body: unknown = await response.json();
      if (
        typeof body !== "object" ||
        body === null ||
        !("ok" in body) ||
        body.ok !== true
      ) {
        const message =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : "Le test de connexion a échoué.";
        throw new Error(message);
      }
      const testedProvider =
        "provider" in body && typeof body.provider === "string"
          ? body.provider
          : savedConfig.provider;
      const testedModel =
        "model" in body && typeof body.model === "string" ? body.model : "";
      setNotice(
        `Connexion réussie · ${testedProvider}${testedModel ? ` · ${testedModel}` : ""}`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Le test de connexion a échoué.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        aria-label={label}
        aria-haspopup="dialog"
        title={label}
        className={buttonClassName}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          className="size-4 text-amber-200"
        >
          <path
            d="M12 3.5v2m0 13v2m8.5-8.5h-2m-13 0h-2m15.01-6.01-1.42 1.42M6.91 17.09l-1.42 1.42m12.02 0-1.42-1.42M6.91 6.91 5.49 5.49M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>{displayLabel}</span>
      </button>

      {isOpen && portalReady && typeof document !== "undefined"
        ? createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeModal();
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="llm-config-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#111114] p-6 shadow-2xl"
          >
            <header className="mb-6 flex items-start justify-between gap-5">
              <div>
                <p className="text-sm font-medium text-amber-200">
                  Paramètres privés
                </p>
                <h2
                  id="llm-config-title"
                  className="mt-1.5 font-serif text-2xl text-zinc-50"
                >
                  Connexion à votre IA
                </h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Les clés sont enregistrées côté serveur et ne sont jamais
                  renvoyées en clair.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Fermer"
                className="grid size-10 shrink-0 place-items-center rounded-full text-zinc-400 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  ×
                </span>
              </button>
            </header>

            {busy === "load" || (!config && !error) ? (
              <p className="rounded-xl border border-white/[0.08] bg-black/20 p-5 text-sm text-zinc-400">
                Chargement des paramètres…
              </p>
            ) : (
              <div className="space-y-5">
                <fieldset>
                  <legend className="mb-2 text-[13px] font-medium text-zinc-300">
                    Fournisseur principal
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["gemini", "Gemini", "Google AI Studio"],
                        ["openrouter", "OpenRouter", "Plusieurs modèles"],
                      ] as const
                    ).map(([value, name, description]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={provider === value}
                        onClick={() => setProvider(value)}
                        className={`rounded-xl border p-3 text-left transition ${
                          provider === value
                            ? "border-amber-200/40 bg-amber-200/[0.07]"
                            : "border-white/[0.08] bg-black/15 hover:border-white/20"
                        }`}
                      >
                        <span className="block text-sm font-semibold text-zinc-100">
                          {name}
                        </span>
                        <span className="mt-1 block text-xs text-zinc-400">
                          {description}
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <label
                    htmlFor="llm-model"
                    className="mb-2 block text-[13px] font-medium text-zinc-300"
                  >
                    Modèle {provider === "gemini" ? "Gemini" : "OpenRouter"}
                  </label>
                  <input
                    id="llm-model"
                    value={provider === "gemini" ? model : openrouterModel}
                    onChange={(event) =>
                      provider === "gemini"
                        ? setModel(event.target.value)
                        : setOpenrouterModel(event.target.value)
                    }
                    autoComplete="off"
                    className="h-11 w-full rounded-xl border border-white/[0.1] bg-zinc-950 px-3.5 text-sm text-zinc-100 outline-none transition-colors duration-150 placeholder:text-zinc-600 focus:border-amber-200/50 focus:ring-2 focus:ring-amber-200/10"
                    placeholder="Nom du modèle"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {modelSuggestions[provider].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() =>
                          provider === "gemini"
                            ? setModel(suggestion)
                            : setOpenrouterModel(suggestion)
                        }
                        className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] text-zinc-300 transition-colors duration-150 hover:border-amber-200/30 hover:text-amber-100"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border border-white/[0.08] bg-black/15 p-4">
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label
                        htmlFor="gemini-key"
                        className="text-[13px] font-medium text-zinc-300"
                      >
                        Clé Gemini
                      </label>
                      {config?.hasGeminiKey ? (
                        <button
                          type="button"
                          onClick={() =>
                            void saveConfig({ clearGeminiApiKey: true })
                          }
                          disabled={busy !== null}
                          className="min-h-11 rounded-full px-3 text-xs text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Effacer la clé
                        </button>
                      ) : null}
                    </div>
                    <input
                      id="gemini-key"
                      type="password"
                      autoComplete="new-password"
                      value={geminiApiKey}
                      onChange={(event) => setGeminiApiKey(event.target.value)}
                      placeholder={
                        config?.hasGeminiKey
                          ? `Clé enregistrée : ${config.geminiKeyMask}`
                          : "Collez votre clé API Gemini"
                      }
                      className="h-11 w-full rounded-xl border border-white/[0.1] bg-zinc-950 px-3.5 text-sm text-zinc-100 outline-none transition-colors duration-150 placeholder:text-zinc-500 focus:border-amber-200/50 focus:ring-2 focus:ring-amber-200/10"
                    />
                    {config?.hasGeminiKey ? (
                      <p className="mt-1.5 text-[11px] text-emerald-300">
                        Une clé Gemini est configurée. Laisser le champ vide la
                        conserve.
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label
                        htmlFor="openrouter-key"
                        className="text-[13px] font-medium text-zinc-300"
                      >
                        Clé OpenRouter
                        {provider === "gemini" ? (
                          <span className="ml-1.5 text-[11px] font-normal text-zinc-500">
                            (repli automatique)
                          </span>
                        ) : null}
                      </label>
                      {config?.hasOpenrouterKey ? (
                        <button
                          type="button"
                          onClick={() =>
                            void saveConfig({ clearOpenrouterApiKey: true })
                          }
                          disabled={busy !== null}
                          className="min-h-11 shrink-0 rounded-full px-3 text-xs text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Effacer la clé
                        </button>
                      ) : null}
                    </div>
                    <input
                      id="openrouter-key"
                      type="password"
                      autoComplete="new-password"
                      value={openrouterApiKey}
                      onChange={(event) =>
                        setOpenrouterApiKey(event.target.value)
                      }
                      placeholder={
                        config?.hasOpenrouterKey
                          ? `Clé enregistrée : ${config.openrouterKeyMask}`
                          : "Collez votre clé API OpenRouter"
                      }
                      className="h-11 w-full rounded-xl border border-white/[0.1] bg-zinc-950 px-3.5 text-sm text-zinc-100 outline-none transition-colors duration-150 placeholder:text-zinc-500 focus:border-amber-200/50 focus:ring-2 focus:ring-amber-200/10"
                    />
                    {config?.hasOpenrouterKey ? (
                      <p className="mt-1.5 text-[11px] text-emerald-300">
                        Une clé OpenRouter est configurée. Laisser le champ
                        vide la conserve.
                      </p>
                    ) : null}
                  </div>
                </div>

                {error ? (
                  <p
                    role="alert"
                    className="rounded-lg border border-rose-400/20 bg-rose-400/[0.08] px-3.5 py-3 text-[13px] leading-5 text-rose-200"
                  >
                    {error}
                  </p>
                ) : null}
                {notice ? (
                  <p
                    role="status"
                    className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.07] px-3.5 py-3 text-[13px] leading-5 text-emerald-200"
                  >
                    {notice}
                  </p>
                ) : null}

                <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => void saveConfig()}
                    disabled={busy !== null}
                    className="h-11 rounded-full border border-white/[0.1] px-4 text-sm font-medium text-zinc-200 transition-colors duration-150 hover:bg-white/[0.06] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busy === "save" ? "Enregistrement…" : "Enregistrer"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void testConnection()}
                    disabled={busy !== null}
                    className="min-h-11 rounded-full bg-white px-5 text-sm font-medium text-zinc-950 transition-colors duration-150 hover:bg-zinc-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busy === "test" ? "Test en cours…" : "Enregistrer et tester"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>,
        document.body,
      )
        : null}
    </>
  );
}
