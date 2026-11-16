"use client";

import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

export function updateSessionStateField<T extends object, K extends keyof T>(
  setState: Dispatch<SetStateAction<T>>,
  key: K,
  update: SetStateAction<T[K]>,
): void {
  setState((current) => {
    const value =
      typeof update === "function"
        ? (update as (previous: T[K]) => T[K])(current[key])
        : update;
    return { ...current, [key]: value };
  });
}

export function useSessionState<T>(
  key: string,
  initialValue: T,
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [value, setValue] = useState(initialValue);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(key);
      if (saved !== null) {
        setValue(JSON.parse(saved) as T);
      }
    } catch {
      // Storage can be unavailable or contain invalid JSON; retain the initial value.
    } finally {
      setIsHydrated(true);
    }
  }, [key]);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Keep the in-memory state usable when browser storage is unavailable or full.
    }
  }, [isHydrated, key, value]);

  return [value, setValue, isHydrated];
}
