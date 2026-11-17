"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useHotkeys } from "@/hooks/useHotkeys";

function ShortcutRow({ keys, children }: { keys: string; children: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <dt className="text-sm leading-5 text-zinc-300">{children}</dt>
      <dd className="shrink-0">
        <kbd className="rounded-md border border-white/[0.1] bg-white/[0.05] px-2 py-1 font-mono text-xs text-zinc-100">
          {keys}
        </kbd>
      </dd>
    </div>
  );
}

export function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useHotkeys([
    {
      key: "?",
      action: () => setOpen(true),
    },
  ]);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-11 w-full items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 text-left text-[13px] text-zinc-300 transition-colors duration-150 hover:bg-white/[0.07] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
      >
        Raccourcis
        <kbd className="rounded-md border border-white/[0.1] bg-white/[0.05] px-1.5 py-0.5 font-mono text-xs text-zinc-400">
          ?
        </kbd>
      </button>

      {mounted && open
        ? createPortal(
            <section
              role="dialog"
              aria-modal="false"
              aria-labelledby="keyboard-shortcuts-title"
              className="fixed bottom-20 left-4 z-[70] max-h-[min(70vh,38rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-white/[0.1] bg-[#111114] p-4 shadow-2xl shadow-black/50 sm:left-6 sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-zinc-400">Aide de navigation</p>
                  <h2
                    id="keyboard-shortcuts-title"
                    className="mt-1 font-serif text-xl text-white"
                  >
                    Raccourcis clavier
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label="Fermer l’aide des raccourcis"
                  onClick={() => setOpen(false)}
                  className="grid size-11 shrink-0 place-items-center rounded-full border border-white/[0.08] text-zinc-300 transition-colors duration-150 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-amber-200"
                >
                  ×
                </button>
              </div>

              <div className="mt-4 space-y-4">
                <section>
                  <h3 className="text-xs font-medium text-amber-100">
                    Révision
                  </h3>
                  <dl className="mt-1 divide-y divide-white/[0.06]">
                    <ShortcutRow keys="Espace / Entrée">
                      Retourner la carte
                    </ShortcutRow>
                    <ShortcutRow keys="1–4">Noter la réponse</ShortcutRow>
                    <ShortcutRow keys="R">Réécouter le mot</ShortcutRow>
                  </dl>
                </section>
                <section>
                  <h3 className="text-xs font-medium text-violet-100">
                    Entraînement libre
                  </h3>
                  <dl className="mt-1 divide-y divide-white/[0.06]">
                    <ShortcutRow keys="Espace / Entrée">
                      Retourner la carte
                    </ShortcutRow>
                    <ShortcutRow keys="← / →">
                      Naviguer entre les cartes
                    </ShortcutRow>
                    <ShortcutRow keys="R">Réécouter le mot</ShortcutRow>
                  </dl>
                </section>
                <section>
                  <h3 className="text-xs font-medium text-emerald-100">
                    Traduction
                  </h3>
                  <dl className="mt-1 divide-y divide-white/[0.06]">
                    <ShortcutRow keys="Ctrl / ⌘ + Entrée">
                      Évaluer ou passer à la suite
                    </ShortcutRow>
                    <ShortcutRow keys="Alt + R">
                      Écouter la référence
                    </ShortcutRow>
                  </dl>
                </section>
                <section>
                  <h3 className="text-xs font-medium text-indigo-100">Leçon</h3>
                  <dl className="mt-1 divide-y divide-white/[0.06]">
                    <ShortcutRow keys="Alt + P">
                      Lire ou mettre en pause
                    </ShortcutRow>
                    <ShortcutRow keys="Échap">
                      Fermer le détail d’un mot
                    </ShortcutRow>
                  </dl>
                </section>
              </div>
            </section>,
            document.body,
          )
        : null}
    </>
  );
}
