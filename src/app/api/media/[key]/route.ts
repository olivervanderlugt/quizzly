import { readMedia } from "@/lib/media/storage";

/**
 * Serve an uploaded image.
 *
 * Public and unauthenticated, on purpose. The URL carries 128 bits of
 * randomness, so knowing it *is* the permission — the same posture the app
 * already had for pasted image URLs, where anyone holding the link can see the
 * picture. Players are anonymous mid-game and have no session to check, so
 * gating reads would mean inventing an access-control system that the feature
 * this replaces never had.
 *
 * What that does mean: an image is readable by anyone the link reaches, and
 * removing it from a question does not unpublish the file. `SECURITY.md` says
 * so out loud rather than implying a privacy guarantee that isn't there.
 */

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  const data = await readMedia(key);
  if (!data) return new Response("Not found", { status: 404 });

  // A view over the same memory, not a copy: `Response` wants a BufferSource,
  // and Node's Buffer isn't one as far as the DOM lib's types are concerned.
  const body = new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);

  return new Response(body, {
    headers: {
      // Always WebP: every upload is re-encoded before it is stored, so the
      // stored bytes and this header cannot disagree.
      "content-type": "image/webp",
      "content-length": String(data.length),
      // The name is random and the bytes behind it never change, so this is
      // safe to cache forever. Replacing an image mints a new key.
      "cache-control": "public, max-age=31536000, immutable",
      // Belt and braces: never let a browser sniff its way to another type.
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
    },
  });
}
