import sharp from "sharp";

import {
  MAX_IMAGE_DIMENSION,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  type AcceptedUploadType,
} from "./ref";

/**
 * Turning bytes somebody uploaded into an image we are willing to store.
 *
 * The order of the checks is the design. Cheap and certain first (how many
 * bytes, what do the first bytes say this is), expensive and permissive last
 * (can a real decoder make sense of it). Nothing here trusts a filename, an
 * extension, or a Content-Type header — all three are attacker-controlled, and
 * an upload endpoint that believes them is how a "profile picture" becomes a
 * stored XSS or a PHP shell.
 *
 * Everything that survives is re-encoded from decoded pixels to WebP. That is
 * how EXIF is stripped: not by deleting the tags we happen to know about, but
 * by never carrying the container's metadata across in the first place. A photo
 * off a phone routinely embeds GPS coordinates, and a quiz slide is a very
 * public place to publish where you live.
 */

/** Ceiling on decoded pixels, ~50 MP. */
const MAX_INPUT_PIXELS = 50_000_000;

/** WebP quality. 82 is visually clean at projector size and roughly halves JPEG. */
const WEBP_QUALITY = 82;

export type ProcessedImage = {
  data: Buffer;
  contentType: "image/webp";
  width: number;
  height: number;
};

export type ProcessResult =
  | { ok: true; image: ProcessedImage }
  | { ok: false; error: string };

/**
 * Identify an image by its magic bytes.
 *
 * Returns null for anything not on the allowlist, including formats we can
 * recognise but refuse (see `ACCEPTED_UPLOAD_TYPES` for why GIF and SVG are
 * out). Recognising them anyway lets the caller say something better than
 * "invalid file".
 */
export function sniffImageType(bytes: Uint8Array): AcceptedUploadType | null {
  if (bytes.length < 12) return null;

  // JPEG: SOI marker, then the start of any segment.
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: the 8-byte signature, including the CRLF/EOF bytes that catch
  // transfers mangled by a text-mode transport.
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  // WebP: a RIFF container whose form type is WEBP at offset 8.
  if (matchesAscii(bytes, 0, "RIFF") && matchesAscii(bytes, 8, "WEBP")) {
    return "image/webp";
  }

  return null;
}

/** True when a byte range spells out the given ASCII string. */
function matchesAscii(bytes: Uint8Array, offset: number, text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/** Recognised-but-refused formats, so the error can name the actual problem. */
function describeRejectedFormat(bytes: Uint8Array): string | null {
  if (matchesAscii(bytes, 0, "GIF87a") || matchesAscii(bytes, 0, "GIF89a")) {
    return "GIF isn't supported — uploaded images are re-encoded as still frames, so the animation would be lost. Convert it to a PNG or WebP first.";
  }

  // SVG is text; look for the root element near the start, past any BOM,
  // XML declaration or doctype.
  const head = Buffer.from(bytes.subarray(0, 256)).toString("utf8");
  if (head.includes("<svg") || head.includes("<?xml")) {
    return "SVG isn't supported — it's a document that can carry scripts, and this server won't host one. Export it as a PNG or WebP first.";
  }

  return null;
}

/**
 * Validate, normalise and strip metadata from an uploaded image.
 *
 * The returned buffer is always WebP: one output format means one
 * `Content-Type` to serve, one extension in the URL, and no path where an
 * original container (with its metadata and its parser quirks) is handed back
 * to a browser verbatim.
 */
export async function processImageUpload(input: Uint8Array): Promise<ProcessResult> {
  if (input.length === 0) return { ok: false, error: "That file is empty." };

  if (input.length > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `That image is larger than ${MAX_UPLOAD_LABEL}. Shrink it and try again.`,
    };
  }

  const sniffed = sniffImageType(input);
  if (!sniffed) {
    return {
      ok: false,
      error:
        describeRejectedFormat(input) ??
        "That doesn't look like a JPEG, PNG or WebP image. The file's contents are checked, not its name — renaming it won't help.",
    };
  }

  try {
    const pipeline = sharp(input, {
      limitInputPixels: MAX_INPUT_PIXELS,
      // A small file can decode to an enormous bitmap. One frame is all we
      // keep, so an animated WebP never multiplies that by its frame count.
      animated: false,
    })
      // Applies the EXIF orientation and then forgets it. Without this,
      // stripping metadata would silently turn every portrait phone photo
      // sideways.
      .rotate()
      .resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      // No `.withMetadata()` / `.withExif()` anywhere: sharp only carries
      // metadata across when asked, so this is the EXIF strip.
      .webp({ quality: WEBP_QUALITY });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

    return {
      ok: true,
      image: {
        data,
        contentType: "image/webp",
        width: info.width,
        height: info.height,
      },
    };
  } catch {
    // Right magic bytes, unreadable body: truncated, corrupt, or a decompression
    // bomb over the pixel limit. The uploader gets one message for all of them —
    // decoder internals are not their business, and not ours to leak.
    return {
      ok: false,
      error: "That image couldn't be read. It may be corrupt, truncated, or far too large.",
    };
  }
}
