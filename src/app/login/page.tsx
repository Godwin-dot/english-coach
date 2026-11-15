"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setError(
          response.status === 401
            ? "Ce mot de passe ne correspond pas. Réessayez."
            : "La connexion est momentanément indisponible.",
        );
        return;
      }

      window.location.assign("/");
    } catch {
      setError("Impossible de joindre le serveur. Vérifiez votre connexion.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      <div
        aria-hidden="true"
        className="ambient-glow pointer-events-none absolute left-1/2 top-[10%] size-[460px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.12),rgba(244,63,94,0.09)_40%,rgba(99,102,241,0.1)_68%,transparent_74%)] blur-[100px]"
      />
      <div className="page-enter relative w-full max-w-[430px]">
        <div className="mb-9 text-center">
          <div className="mx-auto mb-6 grid size-[58px] place-items-center rounded-[18px] border border-white/10 bg-white text-zinc-950 shadow-[0_0_48px_-20px_rgba(255,255,255,0.4)]">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              className="size-7"
            >
              <path
                d="M5 19.5V6.8A1.8 1.8 0 0 1 6.8 5H19v12.7H6.8A1.8 1.8 0 0 0 5 19.5Zm0 0a1.8 1.8 0 0 1 1.8-1.8H19M8.5 8.5h7M8.5 11.5h5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/80">
            Votre espace d&apos;apprentissage
          </p>
          <h1 className="font-serif text-[34px] font-medium tracking-[-0.04em] text-slate-50">
            English Coach
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Une pratique régulière. Des progrès qui durent.
          </p>
        </div>

        <section className="rounded-3xl border border-white/[0.08] bg-[#111114]/95 p-6 shadow-[0_24px_70px_-35px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:p-8">
          <div className="mb-7">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-slate-100">
              Ravi de vous revoir
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-slate-400">
              Saisissez votre mot de passe pour accéder à votre espace.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-[13px] font-medium text-slate-300"
              >
                Mot de passe
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={visible ? "text" : "password"}
                  autoComplete="current-password"
                  autoFocus
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-describedby={error ? "login-error" : undefined}
                  aria-invalid={Boolean(error)}
                  className="h-12 w-full rounded-xl border border-white/10 bg-zinc-950/80 px-4 pr-12 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-200/60 focus:ring-4 focus:ring-amber-200/10"
                  placeholder="Votre mot de passe"
                />
                <button
                  type="button"
                  onClick={() => setVisible((current) => !current)}
                  aria-label={
                    visible ? "Masquer le mot de passe" : "Afficher le mot de passe"
                  }
                  className="absolute inset-y-0 right-0 grid w-12 place-items-center text-slate-500 transition hover:text-slate-200"
                >
                  {visible ? (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      className="size-[18px]"
                    >
                      <path
                        d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.7 10.7 0 0 1 12 5c5.5 0 9 7 9 7a15.7 15.7 0 0 1-3.1 3.8M6.2 6.2C4.1 7.6 3 12 3 12s3.5 7 9 7a9.9 9.9 0 0 0 3-.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      className="size-[18px]"
                    >
                      <path
                        d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <circle
                        cx="12"
                        cy="12"
                        r="2.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error ? (
              <p
                id="login-error"
                role="alert"
                className="rounded-lg border border-rose-400/20 bg-rose-400/[0.08] px-3.5 py-3 text-[13px] leading-5 text-rose-200"
              >
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting || !password}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-medium text-zinc-950 shadow-lg shadow-white/5 transition hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Connexion…" : "Accéder à mon espace"}
              {!isSubmitting ? (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="none"
                  className="size-4"
                >
                  <path
                    d="M4 10h12m-5-5 5 5-5 5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </button>
          </form>
        </section>

        <p className="mt-7 text-center text-xs text-slate-500">
          Un espace personnel, à votre rythme.
        </p>
      </div>
    </main>
  );
}
