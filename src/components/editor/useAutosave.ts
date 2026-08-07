"use client";

import { useEffect, useRef, useState } from "react";

export type AutosaveStatus = "saved" | "pending" | "saving" | "error";

/**
 * Debounced autosave for a value that is always valid to persist (theme, game
 * rules). Question autosave lives in EditorClient instead, because questions
 * can be transiently invalid (an empty prompt) and are saved per-row.
 *
 * Concurrency is handled by snapshot comparison rather than a lock: if the
 * value changes while a save is in flight, the stale response is ignored and
 * the newer effect run owns the status. Two overlapping writes of the same
 * whole object are harmless — last write wins on the server too.
 */
export function useAutosave<T>(
  value: T,
  save: (value: T) => Promise<{ error?: string }>,
  delayMs = 900,
) {
  const [status, setStatus] = useState<AutosaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);

  const first = useRef(true);
  const latest = useRef(value);
  latest.current = value;
  const savedSnap = useRef<string | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    const snap = JSON.stringify(value);
    if (first.current) {
      first.current = false;
      savedSnap.current = snap;
      return;
    }
    if (snap === savedSnap.current) return;

    setStatus("pending");
    const timer = setTimeout(async () => {
      setStatus("saving");
      const result = await saveRef.current(value);
      // Only the run whose value is still current may report an outcome.
      if (JSON.stringify(latest.current) !== snap) return;
      if (result.error) {
        setStatus("error");
        setError(result.error);
      } else {
        savedSnap.current = snap;
        setError(null);
        setStatus("saved");
      }
    }, delayMs);

    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return { status, error };
}

export function autosaveLabel(status: AutosaveStatus): string {
  switch (status) {
    case "saved":
      return "All changes saved";
    case "pending":
      return "Unsaved changes…";
    case "saving":
      return "Saving…";
    case "error":
      return "Couldn't save";
  }
}

/** Warn before the tab closes while an edit hasn't reached the server yet. */
export function useUnsavedChangesWarning(unsaved: boolean) {
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);
}
