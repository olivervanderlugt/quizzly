import { describe, expect, it } from "vitest";

import {
  detectImageKind,
  isUploadPath,
  stripImageMetadata,
} from "./uploads";

// ─────────────────────────── Fixture builders ───────────────────────────────
// Minimal-but-structurally-valid files, built by hand so the tests document the
// exact byte layout the parser walks.

function jpegWith(segments: number[][]): Uint8Array {
  // SOI, the given segments, then SOS + fake entropy data + EOI.
  return new Uint8Array([
    0xff, 0xd8,
    ...segments.flat(),
    0xff, 0xda, 0x00, 0x04, 0x01, 0x02, // SOS with 2 payload bytes
    0xaa, 0xbb, 0xcc, // entropy-coded data
    0xff, 0xd9, // EOI
  ]);
}

function jpegSegment(marker: number, payload: number[]): number[] {
  const length = payload.length + 2;
  return [0xff, marker, length >> 8, length & 0xff, ...payload];
}

function pngWith(chunks: Array<{ type: string; data: number[] }>): Uint8Array {
  const parts: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (const chunk of [...chunks, { type: "IEND", data: [] }]) {
    const len = chunk.data.length;
    parts.push((len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff);
    for (const c of chunk.type) parts.push(c.charCodeAt(0));
    parts.push(...chunk.data);
    parts.push(0, 0, 0, 0); // CRC — not validated by the stripper
  }
  return new Uint8Array(parts);
}

function webpWith(chunks: Array<{ fourcc: string; data: number[] }>): Uint8Array {
  const body: number[] = [];
  for (const chunk of chunks) {
    for (const c of chunk.fourcc) body.push(c.charCodeAt(0));
    const size = chunk.data.length;
    body.push(size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, (size >> 24) & 0xff);
    body.push(...chunk.data);
    if (size % 2) body.push(0); // pad to even
  }
  const riffSize = 4 + body.length;
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46, // RIFF
    riffSize & 0xff, (riffSize >> 8) & 0xff, (riffSize >> 16) & 0xff, (riffSize >> 24) & 0xff,
    0x57, 0x45, 0x42, 0x50, // WEBP
    ...body,
  ]);
}

// ────────────────────────────── Detection ───────────────────────────────────

describe("detectImageKind", () => {
  it("detects each supported format by magic bytes", () => {
    expect(detectImageKind(jpegWith([]))).toBe("jpeg");
    expect(detectImageKind(pngWith([]))).toBe("png");
    expect(detectImageKind(webpWith([{ fourcc: "VP8 ", data: [1, 2] }]))).toBe("webp");

    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
    expect(detectImageKind(gif)).toBe("gif");
  });

  it("rejects non-image content whatever it claims to be", () => {
    const html = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");
    expect(detectImageKind(html)).toBeNull();

    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(detectImageKind(svg)).toBeNull();
  });

  it("rejects a RIFF file that is not WebP (e.g. WAV audio)", () => {
    const wav = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
    ]);
    expect(detectImageKind(wav)).toBeNull();
  });

  it("rejects anything too short to have a signature", () => {
    expect(detectImageKind(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
});

// ─────────────────────────── Metadata stripping ─────────────────────────────

describe("stripImageMetadata — JPEG", () => {
  it("drops APP1 (EXIF/XMP) and COM segments", () => {
    const exif = jpegSegment(0xe1, [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x99]);
    const comment = jpegSegment(0xfe, [0x68, 0x69]);
    const input = jpegWith([exif, comment]);

    const out = stripImageMetadata(input, "jpeg");

    expect(findBytes(out, [0xff, 0xe1])).toBe(-1);
    expect(findBytes(out, [0xff, 0xfe])).toBe(-1);
  });

  it("keeps colour-critical segments and the image data itself", () => {
    const jfif = jpegSegment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00]);
    const icc = jpegSegment(0xe2, [0x49, 0x43, 0x43, 0x5f]);
    const input = jpegWith([jfif, icc]);

    const out = stripImageMetadata(input, "jpeg");

    expect(findBytes(out, [0xff, 0xe0])).toBeGreaterThan(-1);
    expect(findBytes(out, [0xff, 0xe2])).toBeGreaterThan(-1);
    // SOS onward is untouched: entropy data and EOI survive.
    expect(findBytes(out, [0xaa, 0xbb, 0xcc, 0xff, 0xd9])).toBeGreaterThan(-1);
  });

  it("returns a clean file unchanged", () => {
    const input = jpegWith([jpegSegment(0xe0, [1, 2, 3])]);
    expect(stripImageMetadata(input, "jpeg")).toEqual(input);
  });
});

describe("stripImageMetadata — PNG", () => {
  it("drops textual, time, and EXIF chunks but keeps pixel data", () => {
    const input = pngWith([
      { type: "IHDR", data: [0, 0, 0, 1, 0, 0, 0, 1, 8, 0, 0, 0, 0] },
      { type: "tEXt", data: [0x41, 0x00, 0x42] },
      { type: "eXIf", data: [1, 2, 3] },
      { type: "tIME", data: [7, 0xe8, 1, 1, 0, 0, 0] },
      { type: "IDAT", data: [9, 9, 9] },
    ]);

    const out = stripImageMetadata(input, "png");
    const text = new TextDecoder("latin1").decode(out);

    expect(text).toContain("IHDR");
    expect(text).toContain("IDAT");
    expect(text).toContain("IEND");
    expect(text).not.toContain("tEXt");
    expect(text).not.toContain("eXIf");
    expect(text).not.toContain("tIME");
  });
});

describe("stripImageMetadata — WebP", () => {
  it("drops EXIF and XMP chunks and fixes the RIFF size", () => {
    const input = webpWith([
      { fourcc: "VP8 ", data: [1, 2, 3, 4] },
      { fourcc: "EXIF", data: [9, 9, 9] },
      { fourcc: "XMP ", data: [8, 8] },
    ]);

    const out = stripImageMetadata(input, "webp");
    const text = new TextDecoder("latin1").decode(out);

    expect(text).toContain("VP8 ");
    expect(text).not.toContain("EXIF");
    expect(text).not.toContain("XMP ");

    // RIFF size field must equal everything after the 8-byte header.
    const declared = out[4]! | (out[5]! << 8) | (out[6]! << 16) | (out[7]! << 24);
    expect(declared).toBe(out.length - 8);
  });

  it("clears the EXIF/XMP presence flags in VP8X", () => {
    const vp8xData = [0x0c | 0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // EXIF+XMP+alpha flags
    const input = webpWith([
      { fourcc: "VP8X", data: vp8xData },
      { fourcc: "EXIF", data: [1] },
    ]);

    const out = stripImageMetadata(input, "webp");
    const flagsOffset = 12 + 8; // header + VP8X fourcc/size
    expect(out[flagsOffset]! & 0x0c).toBe(0);
    expect(out[flagsOffset]! & 0x10).toBe(0x10); // alpha flag untouched
  });
});

// ───────────────────────────── URL validation ───────────────────────────────

describe("isUploadPath", () => {
  it("accepts the exact shape the upload route produces", () => {
    expect(isUploadPath("/uploads/Ab3dEf6hIj8lMn0p_q-s.webp")).toBe(true);
    expect(isUploadPath("/uploads/0123456789abcdefghij.jpg")).toBe(true);
  });

  it("rejects traversal, wrong prefixes, and wrong extensions", () => {
    expect(isUploadPath("/uploads/../../etc/passwd")).toBe(false);
    expect(isUploadPath("/uploads/short.png")).toBe(false);
    expect(isUploadPath("/uploads/0123456789abcdefghij.svg")).toBe(false);
    expect(isUploadPath("uploads/0123456789abcdefghij.png")).toBe(false);
    expect(isUploadPath("https://example.com/uploads/0123456789abcdefghij.png")).toBe(false);
  });
});

function findBytes(haystack: Uint8Array, needle: number[]): number {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}
