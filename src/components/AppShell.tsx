"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LLMConfigModal } from "./LLMConfigModal";
import { KeyboardShortcutsHelp } from "./KeyboardShortcutsHelp";

const navigation = [
  { href: "/", label: "Tableau de bord", mobileLabel: "Accueil", icon: "grid" },
  { href: "/lesson", label: "Micro-leçon", mobileLabel: "Leçon", icon: "book" },
  { href: "/review", label: "Révision FSRS", mobileLabel: "Révision", icon: "repeat" },
  { href: "/drill", label: "Traduction", mobileLabel: "Traduction", icon: "translate" },
  { href: "/speak", label: "Prononciation", mobileLabel: "Prononciation", icon: "mic" },
  { href: "/chat", label: "Conversation", mobileLabel: "Conversation", icon: "chat" },
  { href: "/history", label: "Historique", mobileLabel: "Historique", icon: "history" },
  { href: "/session", label: "Session 10 min", mobileLabel: "10 min", icon: "timer" },
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
    mic: (
      <>
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8" />
      </>
    ),
    timer: (
      <>
        <circle cx="12" cy="13" r="8" />
        <path d="M10 2h4m-2 3v2m5.7.3 1.4-1.4M12 9v4l2.5 1.5" />
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
  activeNav?:
    | "home"
    | "lesson"
    | "drill"
    | "speak"
    | "chat"
    | "review"
    | "history"
    | "session";
}) {
  const pathname = usePathname();
  const [configured, setConfigured] = useState(hasProviderKey);
  const activeHref =
    activeNav === undefined
      ? undefined
      : {
          home: "/",
          lesson: "/lesson",
          drill: "/drill",
          speak: "/speak",
          chat: "/chat",
          review: "/review",
          history: "/history",
          session: "/session",
        }[activeNav];

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
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/[0.08] bg-[#000000] px-5 py-6 lg:flex">
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

        <div className="mt-10 rounded-2xl border border-white/[0.08] bg-[#0A0A0A] p-4">
          <p className="text-sm font-medium leading-5 text-zinc-100">
            Bonjour, prêt à pratiquer ?
          </p>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-zinc-400">Niveau cible</span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-zinc-300">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-400" />
              {targetLevel}
            </span>
          </div>
        </div>

        <nav aria-label="Navigation principale" className="mt-8 space-y-1.5">
          {navigation.map((item) => {
            const active =
              activeHref !== undefined
                ? item.href === activeHref
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
                    ? "border-white/[0.10] bg-white/[0.07] text-[#EDEDED]"
                    : "border-transparent text-zinc-400 hover:border-white/[0.08] hover:bg-[#111111] hover:text-zinc-100"
                }`}
              >
                <NavigationIcon name={item.icon} />
                {item.label}
                <span className="ml-auto flex items-center gap-2">
                  {item.href === "/review" && dueCount > 0 ? (
                    <span className="min-w-5 rounded-full bg-white/[0.08] px-1.5 py-0.5 text-center font-mono text-[10px] tabular-nums text-zinc-200">
                      {dueCount}
                    </span>
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
                configured ? "bg-emerald-400" : "bg-[#FBBF24]"
              }`}
            />
            <LLMConfigModal
              label="Configuration IA"
              displayLabel="Configuration IA"
              buttonClassName="flex min-h-11 w-full items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0A0A0A] pl-9 pr-3 text-left text-[13px] font-medium text-zinc-300 transition-colors duration-150 hover:border-white/[0.18] hover:bg-[#111111] hover:text-[#EDEDED]"
            />
          </div>
          {passwordAuthEnabled ? (
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-[13px] text-zinc-400 transition-colors duration-150 hover:bg-[#111111] hover:text-[#EDEDED]"
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
        <header className="fixed inset-x-0 top-0 z-20 flex h-16 items-center justify-between border-b border-white/[0.08] bg-[#000000]/90 px-4 backdrop-blur lg:hidden">
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
            <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-zinc-300">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-400" />
              {targetLevel}
            </span>
            <span className="relative">
              <span
                aria-hidden="true"
                className={`absolute right-2 top-2 size-1.5 rounded-full ${
                  configured ? "bg-emerald-400" : "bg-[#FBBF24]"
                }`}
              />
              <LLMConfigModal
                label="Configuration IA"
                buttonClassName="flex h-10 items-center gap-2 rounded-full border border-white/[0.12] bg-[#0A0A0A] px-3 text-xs font-medium text-zinc-200 transition-colors duration-150 hover:border-white/[0.22] hover:bg-[#141414]"
              />
            </span>
          </div>
        </header>

        <div className="min-h-[calc(100dvh-4rem)] pb-32 pt-16 min-[480px]:pb-24 lg:min-h-dvh lg:pb-0 lg:pt-0">
          {children}
        </div>
      </div>

      <nav
        aria-label="Navigation mobile"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-white/[0.08] bg-[#000000]/95 px-1 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur min-[480px]:grid-cols-8 lg:hidden"
      >
        {navigation.map((item) => {
          const active =
            activeHref !== undefined
              ? item.href === activeHref
              : item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium transition-colors duration-150 ${
                active ? "text-[#EDEDED]" : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              <NavigationIcon name={item.icon} />
              <span className="max-w-full truncate">{item.mobileLabel}</span>
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
