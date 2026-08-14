import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Relative, like the rest of src/lib.
import { env } from "../env";
import { MEDIA_KEY_PATTERN } from "./ref";

/**
 * Where uploaded images live on disk.
 *
 * A plain directory on a mounted volume, not object storage. This app is meant
 * to be self-hosted from one `docker compose up`, and a bucket would add a
 * paid dependency, a set of credentials to leak, and a third-party origin in
 * the CSP — for a few hundred quiz images. `docker-compose.yml` mounts a named
 * volume at `MEDIA_UPLOAD_DIR`, so the files survive image rebuilds and never
 * land inside the repo or the container's writable layer.
 *
 * Files are content-addressed by nothing at all: the name is random. That is
 * deliberate — see `MEDIA_KEY_PATTERN` — and it means a re-upload of the same
 * picture stores it twice, which is a trade for never having one quiz's image
 * change because another quiz replaced it.
 */

/** Absolute path of the upload root, resolved once per call from the env. */
export function mediaRoot(): string {
  return path.resolve(env.MEDIA_UPLOAD_DIR);
}

/**
 * Absolute path for a key, or null if the key isn't one we could have issued.
 *
 * Validation happens here rather than at each call site so there is exactly one
 * place where a caller-supplied string can become a filesystem path. The key
 * pattern allows only hex and one known extension, so no amount of `..`,
 * URL-encoding or leading `/` can escape the root.
 */
function resolveKey(key: string): string | null {
  if (!MEDIA_KEY_PATTERN.test(key)) return null;
  // One level of fan-out by the first two characters keeps a single directory
  // from collecting tens of thousands of entries, which some filesystems get
  // slow about.
  return path.join(mediaRoot(), key.slice(0, 2), key);
}

/** Write a processed image and return the key it is served under. */
export async function storeMedia(data: Buffer): Promise<string> {
  const key = `${randomBytes(16).toString("hex")}.webp`;
  const file = resolveKey(key);
  // Unreachable: the key was just generated to match the pattern. Kept as a
  // type-level guarantee that nothing writes outside the root.
  if (!file) throw new Error("generated media key failed its own validation");

  await mkdir(path.dirname(file), { recursive: true });
  // `wx` fails instead of overwriting. With 128 bits of randomness a collision
  // is not a real event, but silently replacing another quiz's image would be.
  await writeFile(file, data, { flag: "wx" });

  return key;
}

/** Read a stored image, or null when the key is invalid or unknown. */
export async function readMedia(key: string): Promise<Buffer | null> {
  const file = resolveKey(key);
  if (!file) return null;

  try {
    return await readFile(file);
  } catch {
    // Missing file, unreadable file — the caller answers 404 either way rather
    // than distinguishing "never existed" from "gone".
    return null;
  }
}
