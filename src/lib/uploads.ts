/**
 * Image upload handling: format sniffing and metadata stripping.
 *
 * Everything here is pure bytes-in bytes-out so it can be unit-tested without a
 * filesystem. The route handler (src/app/api/uploads/route.ts) owns disk I/O.
 *
 * Two rules this module enforces:
 *
 *  - The file TYPE is decided by magic bytes, never by extension or the
 *    client-supplied MIME type. A .png that is really an .html must not end up
 *    served from our origin.
 *  - Metadata is stripped before anything touches disk. Phone photos carry GPS
 *    coordinates in EXIF; a teacher uploading a snap of the classroom
 *    whiteboard should not be publishing the school's location.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type ImageKind = "jpeg" | "png" | "gif" | "webp";

export const IMAGE_KINDS: Record<
  ImageKind,
  { ext: string; mime: string }
> = {
  jpeg: { ext: "jpg", mime: "image/jpeg" },
  png: { ext: "png", mime: "image/png" },
  gif: { ext: "gif", mime: "image/gif" },
  webp: { ext: "webp", mime: "image/webp" },
};

/** Uploaded files are served from this path, same-origin. */
export const UPLOAD_URL_PREFIX = "/uploads/";

/**
 * The complete shape of a stored upload's filename: an unguessable base64url
 * name plus an extension we assigned from the sniffed type. Doubles as the
 * path-traversal guard on the serving route — nothing outside this alphabet
 * can address a file.
 */
export const UPLOAD_NAME_RE = /^[A-Za-z0-9_-]{16,64}\.(?:png|jpg|gif|webp)$/;

export function isUploadPath(value: string): boolean {
  return (
    value.startsWith(UPLOAD_URL_PREFIX) &&
    UPLOAD_NAME_RE.test(value.slice(UPLOAD_URL_PREFIX.length))
  );
}

// ────────────────────────────── Type sniffing ───────────────────────────────

export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  if (bytes.length < 12) return null;

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";

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
    return "png";
  }

  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "gif";
  }

  if (
    bytes[0] === 0x52 && // RIFF
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 && // WEBP
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }

  return null;
}

// ──────────────────────────── Metadata stripping ────────────────────────────

/**
 * Remove embedded metadata without re-encoding pixels.
 *
 * JPEG loses APP1 (EXIF and XMP, which is where GPS lives) and COM comments;
 * colour-critical segments (JFIF APP0, ICC APP2, Adobe APP14) are kept so the
 * image still renders identically. PNG loses its textual and EXIF chunks. WebP
 * loses its EXIF/XMP chunks. GIF has no EXIF and passes through unchanged.
 */
export function stripImageMetadata(bytes: Uint8Array, kind: ImageKind): Uint8Array {
  switch (kind) {
    case "jpeg":
      return stripJpeg(bytes);
    case "png":
      return stripPng(bytes);
    case "webp":
      return stripWebp(bytes);
    case "gif":
      return bytes;
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function stripJpeg(bytes: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [bytes.subarray(0, 2)]; // SOI
  let i = 2;

  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) break; // malformed from here on — keep verbatim

    const marker = bytes[i + 1]!;

    // SOS: entropy-coded data follows to the end. Copy the rest untouched.
    if (marker === 0xda) {
      parts.push(bytes.subarray(i));
      return concat(parts);
    }

    // Standalone markers with no length field.
    if (marker >= 0xd0 && marker <= 0xd9) {
      parts.push(bytes.subarray(i, i + 2));
      i += 2;
      continue;
    }

    const length = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    const end = Math.min(i + 2 + length, bytes.length);

    const drop = marker === 0xe1 /* APP1: EXIF + XMP */ || marker === 0xfe; /* COM */
    if (!drop) parts.push(bytes.subarray(i, end));

    i = end;
  }

  parts.push(bytes.subarray(i));
  return concat(parts);
}

const PNG_DROP_CHUNKS = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

function stripPng(bytes: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [bytes.subarray(0, 8)]; // signature
  let i = 8;

  // Chunk layout: 4-byte length, 4-byte type, data, 4-byte CRC. Whole chunks
  // are kept or dropped verbatim, so the CRCs of kept chunks stay valid.
  while (i + 12 <= bytes.length) {
    const length =
      (bytes[i]! << 24) | (bytes[i + 1]! << 16) | (bytes[i + 2]! << 8) | bytes[i + 3]!;
    const type = String.fromCharCode(bytes[i + 4]!, bytes[i + 5]!, bytes[i + 6]!, bytes[i + 7]!);
    const end = Math.min(i + 12 + length, bytes.length);

    if (!PNG_DROP_CHUNKS.has(type)) parts.push(bytes.subarray(i, end));
    if (type === "IEND") return concat(parts);

    i = end;
  }

  parts.push(bytes.subarray(i));
  return concat(parts);
}

function stripWebp(bytes: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let i = 12; // past RIFF header + WEBP fourcc

  // RIFF chunks: 4-byte fourcc, 4-byte little-endian size, data, pad to even.
  while (i + 8 <= bytes.length) {
    const fourcc = String.fromCharCode(bytes[i]!, bytes[i + 1]!, bytes[i + 2]!, bytes[i + 3]!);
    const size = bytes[i + 4]! | (bytes[i + 5]! << 8) | (bytes[i + 6]! << 16) | (bytes[i + 7]! << 24);
    const end = Math.min(i + 8 + size + (size % 2), bytes.length);

    if (fourcc !== "EXIF" && fourcc !== "XMP ") {
      const chunk = new Uint8Array(bytes.subarray(i, end));
      if (fourcc === "VP8X" && chunk.length >= 9) {
        // Clear the EXIF (0x08) and XMP (0x04) presence flags to match.
        chunk[8] = chunk[8]! & ~0x0c;
      }
      parts.push(chunk);
    }

    i = end;
  }

  const body = concat(parts);
  const out = new Uint8Array(12 + body.length);
  out.set(bytes.subarray(0, 12));
  out.set(body, 12);

  // Patch the RIFF size: everything after the 8-byte RIFF header.
  const riffSize = out.length - 8;
  out[4] = riffSize & 0xff;
  out[5] = (riffSize >> 8) & 0xff;
  out[6] = (riffSize >> 16) & 0xff;
  out[7] = (riffSize >> 24) & 0xff;

  return out;
}
