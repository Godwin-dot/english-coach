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
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-5 py-12">
      <div className="page-enter relative w-full max-w-[430px]">
        <div className="mb-9 text-center">
          <div className="mx-auto mb-6 grid size-[58px] place-items-center rounded-[18px] border border-white/10 bg-white text-zinc-950">
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
          <p className="mb-2 text-sm text-[#888888]">
            Votre espace d&apos;apprentissage
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-[#EDEDED] sm:text-3xl">
            English Coach
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[#888888]">
            Une pratique régulière. Des progrès qui durent.
          </p>
        </div>

        <section className="rounded-2xl border border-white/[0.08] bg-[#0A0A0A] p-6 sm:p-8">
          <div className="mb-7">
            <h2 className="text-[17px] font-semibold tracking-tight text-[#EDEDED]">
              Ravi de vous revoir
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[#888888]">
              Saisissez votre mot de passe pour accéder à votre espace.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-[13px] font-medium text-zinc-300"
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
                  className="h-10 w-full rounded-lg border border-white/[0.12] bg-[#000000] px-4 pr-12 text-sm text-[#EDEDED] outline-none transition-colors duration-150 placeholder:text-zinc-500 focus:border-white/[0.3] focus:ring-2 focus:ring-white/[0.08]"
                  placeholder="Votre mot de passe"
                />
                <button
                  type="button"
                  onClick={() => setVisible((current) => !current)}
                  aria-label={
                    visible ? "Masquer le mot de passe" : "Afficher le mot de passe"
                  }
                  className="absolute inset-y-0 right-0 grid w-12 place-items-center text-zinc-500 transition-colors duration-150 hover:text-zinc-200"
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
              className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[#EDEDED] text-sm font-medium text-[#0A0A0A] transition-colors duration-150 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-60"
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

        <p className="mt-7 text-center text-xs text-[#888888]">
          Un espace personnel, à votre rythme.
        </p>
      </div>
    </main>
  );
}
