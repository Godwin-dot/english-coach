"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LLMConfigModal } from "./LLMConfigModal";
import { KeyboardShortcutsHelp } from "./KeyboardShortcutsHelp";

const navigation = [
  { href: "/", label: "Tableau de bord", mobileLabel: "Aujourd'hui", icon: "grid" },
  { href: "/lesson", label: "Micro-leçon", mobileLabel: "Leçon", icon: "book" },
  { href: "/drill", label: "Traduction active", mobileLabel: "Traduction", icon: "translate" },
  { href: "/chat", label: "Conversation", mobileLabel: "Chat", icon: "chat" },
  { href: "/review", label: "Révision FSRS", mobileLabel: "Révision", icon: "repeat" },
  { href: "/history", label: "Historique", mobileLabel: "Historique", icon: "history" },
] as const;

function NavigationIcon({ name }: { name: (typeof navigation)[number]["icon"] }) {
  const paths = {
    grid: (
      <>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
      </>
    ),
    book: (
      <>
        <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H20v16H7.5A2.5 2.5 0 0 0 5 21.5z" />
        <path d="M5 5.5v16M9 7h7m-7 4h7" />
      </>
    ),
    translate: (
      <>
        <path d="M4 5h10M9 3v2c0 4-2 7-5 9m2-5c1.2 1.7 2.8 3 4.5 4" />
        <path d="M13 18h8m-7-3 3-7 3 7m-5-2h4" />
      </>
    ),
    repeat: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M5.5 9a7 7 0 0 1 12-2L20 9M4 15l2.5 2a7 7 0 0 0 12-2" />
      </>
    ),
    history: (
      <>
        <path d="M3.5 12a8.5 8.5 0 1 0 2.4-5.9L3.5 8.5" />
        <path d="M3.5 4.5v4h4m4.5-1v5l3 2" />
      </>
    ),
    chat: (
      <>
        <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6.5A7.5 7.5 0 0 1 10.5 7H12" />
        <path d="M15.5 3.5h5m-2.5-2.5v5" />
        <path d="M7.5 12h.01M11 12h.01M14.5 12h.01" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="size-[18px] shrink-0"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

export function AppShell({
  children,
  targetLevel,
  dueCount = 0,
  hasProviderKey,
  passwordAuthEnabled,
  activeNav,
}: {
  children: React.ReactNode;
  targetLevel: string;
  dueCount?: number;
  hasProviderKey: boolean;
  passwordAuthEnabled: boolean;
  activeNav?: "home" | "lesson" | "drill" | "chat" | "review" | "history";
}) {
  const pathname = usePathname();
  const [configured, setConfigured] = useState(hasProviderKey);

  useEffect(() => {
    function handleConfigSaved(event: Event) {
      if (event instanceof CustomEvent) {
        setConfigured(event.detail === true);
      }
    }

    window.addEventListener("english-coach:llm-config-saved", handleConfigSaved);
    return () =>
      window.removeEventListener(
        "english-coach:llm-config-saved",
        handleConfigSaved,
      );
  }, []);

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/[0.07] bg-zinc-950/75 px-5 py-6 backdrop-blur-xl lg:flex">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-[14px] bg-white text-zinc-950">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5">
              <path
                d="M5 19.5V6.8A1.8 1.8 0 0 1 6.8 5H19v12.7H6.8A1.8 1.8 0 0 0 5 19.5Zm0 0a1.8 1.8 0 0 1 1.8-1.8H19M8.5 8.5h7M8.5 11.5h5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="text-[15px] font-semibold tracking-[-0.03em] text-white">
            English <span className="text-zinc-500">Coach</span>
          </span>
        </Link>

        <div className="mt-10 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
          <p className="text-sm font-medium leading-5 text-zinc-100">
            Bonjour, prêt à pratiquer ?
          </p>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-zinc-500">Niveau cible</span>
            <span className="rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-2.5 py-1 text-[11px] font-semibold text-amber-200">
              {targetLevel}
            </span>
          </div>
        </div>

        <nav aria-label="Navigation principale" className="mt-8 space-y-1.5">
          {navigation.map((item) => {
            const active =
              activeNav !== undefined
                ? item.href ===
                  (activeNav === "home"
                    ? "/"
                    : activeNav === "lesson"
                      ? "/lesson"
                      : activeNav === "drill"
                        ? "/drill"
                        : activeNav === "chat"
                          ? "/chat"
                          : activeNav === "review"
                            ? "/review"
                            : "/history")
                : item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`group flex min-h-11 items-center gap-3 rounded-xl border px-3 text-[13px] transition-colors duration-150 ${
                  active
                    ? "border-white/[0.11] bg-white/[0.07] text-white shadow-[inset_2px_0_0_0_#fbbf24]"
                    : "border-transparent text-zinc-400 hover:border-white/[0.07] hover:bg-white/[0.04] hover:text-zinc-100"
                }`}
              >
                <NavigationIcon name={item.icon} />
                {item.label}
                <span className="ml-auto flex items-center gap-2">
                  {item.href === "/review" && dueCount > 0 ? (
                    <span className="min-w-5 rounded-full bg-white/[0.08] px-1.5 py-0.5 text-center text-[10px] tabular-nums text-zinc-200">
                      {dueCount}
                    </span>
                  ) : null}
                  {active ? (
                    <span className="size-1.5 rounded-full bg-amber-300" />
                  ) : null}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-2 border-t border-white/[0.07] pt-5">
          <KeyboardShortcutsHelp />
          <div className="relative">
            <span
              aria-hidden="true"
              className={`absolute left-3 top-1/2 z-10 size-1.5 -translate-y-1/2 rounded-full ${
                configured ? "bg-emerald-400" : "bg-amber-300"
              }`}
            />
            <LLMConfigModal
              label="Configuration IA"
              displayLabel="Configuration IA"
              buttonClassName="flex min-h-11 w-full items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.035] pl-9 pr-3 text-left text-[13px] font-medium text-zinc-300 transition hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white"
            />
          </div>
          {passwordAuthEnabled ? (
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-[13px] text-zinc-400 transition hover:bg-white/[0.04] hover:text-white"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="size-[18px]"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10 17l5-5-5-5m5 5H3m9-9h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" />
                </svg>
                Verrouiller
              </button>
            </form>
          ) : null}
        </div>
      </aside>

      <div className="min-w-0 lg:pl-64">
        <header className="fixed inset-x-0 top-0 z-20 flex h-16 items-center justify-between border-b border-white/[0.07] bg-zinc-950/80 px-4 backdrop-blur-xl lg:hidden">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-xl bg-white text-zinc-950">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4">
                <path
                  d="M5 19.5V6.8A1.8 1.8 0 0 1 6.8 5H19v12.7H6.8A1.8 1.8 0 0 0 5 19.5Zm0 0a1.8 1.8 0 0 1 1.8-1.8H19"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="text-sm font-semibold text-white">English Coach</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-2.5 py-1 text-[11px] font-semibold text-amber-200">
              {targetLevel}
            </span>
            <span className="relative">
              <span
                aria-hidden="true"
                className={`absolute right-2 top-2 size-1.5 rounded-full ${
                  configured ? "bg-emerald-400" : "bg-amber-300"
                }`}
              />
              <LLMConfigModal
                label="Configuration IA"
                buttonClassName="flex h-10 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.08]"
              />
            </span>
          </div>
        </header>

        <div className="min-h-screen pb-24 pt-16 lg:pt-0">{children}</div>
      </div>

      <nav
        aria-label="Navigation mobile"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-white/[0.08] bg-zinc-950/90 px-1 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur-xl lg:hidden"
      >
        {navigation.map((item) => {
          const active =
            activeNav !== undefined
              ? item.href ===
                (activeNav === "home"
                  ? "/"
                  : activeNav === "lesson"
                    ? "/lesson"
                    : activeNav === "drill"
                      ? "/drill"
                      : activeNav === "chat"
                        ? "/chat"
                        : activeNav === "review"
                          ? "/review"
                          : "/history")
              : item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium transition-colors duration-150 ${
                active ? "text-white" : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              <NavigationIcon name={item.icon} />
              {item.mobileLabel}
              {item.href === "/review" && dueCount > 0 ? (
                <span className="absolute right-1/4 top-0 min-w-5 rounded-full bg-white/[0.1] px-1.5 py-0.5 text-[9px] tabular-nums text-white">
                  {dueCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
