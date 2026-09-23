import { useCallback, useEffect, useState } from "react";

/** useState persisted to localStorage with JSON. Safe against SSR/private-mode failures. */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw != null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable — keep in-memory */
    }
  }, [key, value]);

  return [value, setValue] as const;
}

/** Lock body scroll while a modal/drawer is open. */
export function useBodyLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [locked]);
}

/** Run a callback on Escape key. */
export function useEscape(onEscape: () => void, active = true) {
  const stable = useCallback(onEscape, [onEscape]);
  useEffect(() => {
    if (!active) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") stable();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [stable, active]);
}

export function initialsOf(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function nextSaturday(): string {
  const d = new Date();
  const delta = (6 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function prettyDate(iso: string) {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
