"use client";

import { useEffect, useRef } from "react";

export type HotkeyBinding = {
  key: string;
  action: (event: KeyboardEvent) => void;
  enabled?: boolean;
  ctrlOrMeta?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  allowInInputs?: boolean;
};

function normalizeKey(key: string): string {
  return key === " " ? "space" : key.toLocaleLowerCase();
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function useHotkeys(bindings: HotkeyBinding[], enabled = true): void {
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (document.querySelector('[role="dialog"]')) return;

      const editable = isEditableTarget(event.target);
      for (const binding of bindingsRef.current) {
        if (
          binding.enabled === false ||
          normalizeKey(event.key) !== normalizeKey(binding.key)
        ) {
          continue;
        }

        const modifiersMatch = binding.ctrlOrMeta
          ? (event.ctrlKey || event.metaKey) && !event.altKey
          : event.ctrlKey === Boolean(binding.ctrlKey) &&
            event.metaKey === Boolean(binding.metaKey) &&
            event.altKey === Boolean(binding.altKey);

        if (!modifiersMatch) continue;
        if (
          editable &&
          (!binding.allowInInputs || !(event.ctrlKey || event.metaKey))
        ) {
          continue;
        }
        if (normalizeKey(binding.key) === "space") {
          event.preventDefault();
        }
        if (event.repeat) return;
        binding.action(event);
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
