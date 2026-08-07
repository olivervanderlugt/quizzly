"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { importQuizAction } from "@/app/actions/quiz";

/** File picker that reads a .quizzly.json export and imports it. */
export function ImportQuizForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);

    startTransition(async () => {
      let raw: unknown;
      try {
        raw = JSON.parse(await file.text());
      } catch {
        setError("That file isn't a Quizzly quiz export.");
        return;
      }

      const result = await importQuizAction(raw);
      if (result.error || !result.quizId) {
        setError(result.error ?? "Import failed.");
        return;
      }
      router.push(`/quiz/${result.quizId}/edit`);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = ""; // allow re-picking the same file after an error
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="btn btn-ghost py-1.5 text-sm"
      >
        {pending ? "Importing…" : "Import a quiz file"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
