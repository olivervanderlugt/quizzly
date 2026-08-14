"use client";

import { useRef, useState } from "react";

import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  UPLOAD_ACCEPT_ATTRIBUTE,
} from "@/lib/media/ref";

/**
 * Pick a file, get back a same-origin URL for it.
 *
 * Every check this does — the size, the accept filter — is a courtesy so the
 * author hears "too big" instantly instead of after a 5 MB round trip. None of
 * it is a security control; `POST /api/media` re-checks the size, sniffs the
 * bytes and verifies quiz ownership on its own, because everything below this
 * line runs on a machine the uploader controls.
 */
export function ImageUpload({
  quizId,
  onUploaded,
  label = "Upload an image",
  disabled,
}: {
  quizId: string;
  onUploaded: (url: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);

    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`That image is larger than ${MAX_UPLOAD_LABEL}.`);
      return;
    }

    setBusy(true);
    try {
      const body = new FormData();
      body.set("quizId", quizId);
      body.set("file", file);

      const response = await fetch("/api/media", { method: "POST", body });
      const result: unknown = await response.json().catch(() => null);
      const url =
        result && typeof result === "object" && "url" in result
          ? String((result as { url: unknown }).url)
          : null;

      if (!response.ok || !url) {
        const message =
          result && typeof result === "object" && "error" in result
            ? String((result as { error: unknown }).error)
            : "The upload failed. Try again.";
        setError(message);
        return;
      }

      onUploaded(url);
    } catch {
      setError("The upload failed — check your connection and try again.");
    } finally {
      setBusy(false);
      // Clear the input so picking the same file twice still fires a change.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_ACCEPT_ATTRIBUTE}
        className="sr-only"
        disabled={disabled || busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <button
        type="button"
        className="btn btn-ghost text-sm"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? "Uploading…" : label}
      </button>

      {error ? (
        <p role="alert" className="mt-1.5 text-sm text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** One line of plain English about what an upload may be. Shown next to it. */
export function UploadHint() {
  return (
    <p className="mt-1 text-xs text-ink-400">
      JPEG, PNG or WebP, up to {MAX_UPLOAD_LABEL}. Uploads are stored on this
      server, re-encoded, and stripped of camera metadata such as GPS location.
    </p>
  );
}
