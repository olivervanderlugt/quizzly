"use client";

import { useRef, useState } from "react";

import { MAX_UPLOAD_BYTES } from "@/lib/uploads";

/**
 * An image source picker: paste a URL, or — when the editor belongs to the
 * quiz owner — upload a file to this server.
 *
 * `uploadQuizId` doubles as the capability switch. The upload endpoint only
 * accepts files from a quiz's owner, so flows that aren't the owner (a group
 * quiz contributor, say) simply don't pass it and get the URL field alone.
 */
export function ImagePicker({
  inputId,
  value,
  onChange,
  uploadQuizId,
  required = false,
  label = "Image",
}: {
  inputId: string;
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  uploadQuizId?: string;
  required?: boolean;
  label?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function upload(file: File) {
    if (!uploadQuizId) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError("Images can be at most 5 MB.");
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const body = new FormData();
      body.set("file", file);
      body.set("quizId", uploadQuizId);

      const response = await fetch("/api/uploads", { method: "POST", body });
      const json = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !json.url) {
        setUploadError(json.error ?? "Upload failed — try again.");
        return;
      }
      onChange(json.url);
    } catch {
      setUploadError("Upload failed — check your connection and try again.");
    } finally {
      setUploading(false);
      // Allow re-selecting the same file after an error.
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <label className="app-label" htmlFor={inputId}>
        {label} {required ? <span className="text-red-400">*</span> : null}
      </label>

      <div className="flex gap-2">
        <input
          id={inputId}
          type="text"
          inputMode="url"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          placeholder="https://… or upload a file"
          className="app-input"
        />
        {uploadQuizId ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
              aria-label={`Upload ${label.toLowerCase()}`}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="btn btn-ghost shrink-0"
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </>
        ) : null}
      </div>

      {uploadQuizId ? (
        <p className="mt-1 text-xs text-ink-500">
          PNG, JPEG, GIF or WebP, up to 5 MB. Location data is stripped on
          upload.
        </p>
      ) : null}

      {uploadError ? (
        <p role="alert" className="mt-1.5 text-sm text-red-400">
          {uploadError}
        </p>
      ) : null}

      {value ? (
        // The author just chose this image; alt text is authored in the field
        // next to this preview, so the preview itself stays decorative.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt=""
          className="mt-3 max-h-44 rounded-lg border border-ink-800 object-contain"
        />
      ) : null}
    </div>
  );
}
