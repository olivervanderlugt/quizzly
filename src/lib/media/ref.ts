import { z } from "zod";

/**
 * The facts about uploaded images that both halves of the app need to agree on:
 * what a stored image's URL looks like, and what an upload is allowed to be.
 *
 * This module is imported by client components and by `src/lib/theme.ts`, so it
 * must stay free of anything server-only — no `sharp`, no filesystem, no env.
 * Everything that touches those lives in `./image.ts` and `./storage.ts`.
 */

/** Uploads are served back from our own origin, never from a third-party host. */
export const MEDIA_URL_PREFIX = "/api/media/";

/**
 * A stored image is 16 random bytes as hex plus the extension we re-encode to.
 *
 * 128 bits is far past guessable, which is what makes the served URL a
 * capability: knowing it is the permission. The pattern is also the whole
 * defence against path traversal — a key that doesn't match never reaches the
 * filesystem, so `../` and absolute paths are rejected before `path.join` sees
 * them rather than being sanitised afterwards.
 */
export const MEDIA_KEY_PATTERN = /^[0-9a-f]{32}\.webp$/;

const MEDIA_PATH_PATTERN = /^\/api\/media\/[0-9a-f]{32}\.webp$/;

/**
 * Hard ceiling on an upload, enforced on the server.
 *
 * 5 MiB comfortably covers a photo straight off a phone (2–4 MB is typical)
 * while bounding what a single request can make the server hold in memory and
 * write to the volume. Anything bigger is wasted on a projected quiz slide:
 * the image is re-encoded and capped at `MAX_IMAGE_DIMENSION` px anyway.
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Human-facing version of the cap, for UI copy and error messages. */
export const MAX_UPLOAD_LABEL = "5 MB";

/**
 * What an upload may be, decided by sniffing the bytes — never by the file
 * extension or the browser-supplied Content-Type, both of which the uploader
 * controls.
 *
 * Excluded on purpose:
 *  - SVG: it is a document that can carry script, and serving it same-origin
 *    would hand an author stored XSS on our own origin. Neutralising SVG
 *    safely is a project of its own; it is simply not allowed.
 *  - GIF: we re-encode to a still image, so an animated GIF would silently
 *    lose its animation. Rejecting it says so instead of quietly disappointing.
 *  - AVIF/HEIC: decoder support varies by build and neither buys us anything
 *    a JPEG or WebP doesn't.
 */
export const ACCEPTED_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AcceptedUploadType = (typeof ACCEPTED_UPLOAD_TYPES)[number];

/** Value for an `<input type="file">` accept attribute — a hint, not a check. */
export const UPLOAD_ACCEPT_ATTRIBUTE = ACCEPTED_UPLOAD_TYPES.join(",");

/** Longest edge we keep. Beyond this is bytes nobody sees. */
export const MAX_IMAGE_DIMENSION = 2000;

/** The same-origin URL an uploaded image is served from. */
export function mediaPathForKey(key: string): string {
  return `${MEDIA_URL_PREFIX}${key}`;
}

/** True for a path this app itself serves an uploaded image from. */
export function isUploadedMediaPath(value: string): boolean {
  return MEDIA_PATH_PATTERN.test(value);
}

/** Matches what `z.string().url()` accepts: any parseable absolute URL. */
function isAbsoluteUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Where an image on a question or a quiz may come from.
 *
 * Two routes, deliberately: an absolute URL the author pasted (unchanged from
 * before uploads existed — hot-linking still works), or a root-relative path to
 * an image we stored. The second alternative is narrow on purpose: it accepts
 * exactly the shape `mediaPathForKey` produces and nothing else, so loosening
 * this field has not turned it into "any string".
 */
export const mediaReferenceSchema = z
  .string()
  .max(2000)
  .refine(
    (value) => isUploadedMediaPath(value) || isAbsoluteUrl(value),
    "must be a full image URL or an image uploaded to this quiz",
  );
