import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";

import { processImageUpload, sniffImageType } from "./image";
import { MAX_IMAGE_DIMENSION, MAX_UPLOAD_BYTES } from "./ref";

/**
 * These tests are the feature's actual security argument, so each one is
 * written to fail if a specific defence is removed: sniff the bytes, cap the
 * size, refuse the scriptable and the animated, and never carry metadata
 * across.
 *
 * Fixtures are generated rather than committed — a checked-in binary is a thing
 * nobody can review in a diff, and sharp is already a dependency.
 */

let jpeg: Buffer;
let png: Buffer;
let webp: Buffer;
let gif: Buffer;
let jpegWithGps: Buffer;
let hugeDimensions: Buffer;

/**
 * The GPS coordinates the fixture carries, as they appear in the TIFF block:
 * 52° 22′ N — little-endian rationals, so this exact byte run is searchable in
 * the file. Finding it in the input and not in the output is the proof.
 */
const LATITUDE_BYTES = Buffer.from([52, 0, 0, 0, 1, 0, 0, 0, 22, 0, 0, 0]);

/**
 * Build a JPEG carrying a real EXIF APP1 segment with a GPS directory.
 *
 * Written out by hand rather than asked of sharp, because sharp's `withExif()`
 * only writes the IFD0..IFD3 directories and silently drops a GPS one — a
 * fixture that quietly contained no GPS data would make the strip test pass for
 * the wrong reason.
 */
function withGpsExif(baseJpeg: Buffer): Buffer {
  const buf = Buffer.alloc(164);
  let at = 0;

  at += buf.write("Exif\0\0", at, "latin1");
  const tiff = at;

  at += buf.write("II", at, "latin1"); // little-endian
  buf.writeUInt16LE(42, at);
  at += 2;
  buf.writeUInt32LE(8, at); // IFD0 sits 8 bytes into the TIFF block
  at += 4;

  // IFD0: a single entry pointing at the GPS directory.
  const gpsOffset = 8 + 2 + 12 + 4;
  buf.writeUInt16LE(1, at);
  at += 2;
  buf.writeUInt16LE(0x8825, at); // GPSInfo IFD pointer
  at += 2;
  buf.writeUInt16LE(4, at); // LONG
  at += 2;
  buf.writeUInt32LE(1, at);
  at += 4;
  buf.writeUInt32LE(gpsOffset, at);
  at += 4;
  buf.writeUInt32LE(0, at); // no IFD1
  at += 4;

  // GPS directory: version, both hemisphere refs, and the two coordinates.
  const dataStart = gpsOffset + 2 + 5 * 12 + 4;
  buf.writeUInt16LE(5, at);
  at += 2;

  const entry = (tag: number, type: number, count: number, value: (offset: number) => void) => {
    buf.writeUInt16LE(tag, at);
    at += 2;
    buf.writeUInt16LE(type, at);
    at += 2;
    buf.writeUInt32LE(count, at);
    at += 4;
    value(at);
    at += 4;
  };

  entry(0x0000, 1, 4, (o) => buf.set([2, 3, 0, 0], o)); // GPSVersionID
  entry(0x0001, 2, 2, (o) => buf.write("N\0", o, "latin1")); // GPSLatitudeRef
  entry(0x0002, 5, 3, (o) => buf.writeUInt32LE(dataStart, o)); // GPSLatitude
  entry(0x0003, 2, 2, (o) => buf.write("E\0", o, "latin1")); // GPSLongitudeRef
  entry(0x0004, 5, 3, (o) => buf.writeUInt32LE(dataStart + 24, o)); // GPSLongitude
  buf.writeUInt32LE(0, at); // no next directory
  at += 4;

  // 52° 22′ 0″ N, 4° 53′ 0″ E — the middle of Amsterdam.
  const rationals = (offset: number, pairs: Array<[number, number]>) => {
    let p = offset;
    for (const [numerator, denominator] of pairs) {
      buf.writeUInt32LE(numerator, p);
      p += 4;
      buf.writeUInt32LE(denominator, p);
      p += 4;
    }
  };
  rationals(tiff + dataStart, [
    [52, 1],
    [22, 1],
    [0, 1],
  ]);
  rationals(tiff + dataStart + 24, [
    [4, 1],
    [53, 1],
    [0, 1],
  ]);

  const payload = buf.subarray(0, tiff + dataStart + 48);
  const marker = Buffer.alloc(4);
  marker.writeUInt16BE(0xffe1, 0); // APP1
  marker.writeUInt16BE(payload.length + 2, 2);

  // Straight after the SOI marker, where a camera would put it.
  return Buffer.concat([baseJpeg.subarray(0, 2), marker, payload, baseJpeg.subarray(2)]);
}

beforeAll(async () => {
  const canvas = () =>
    sharp({
      create: { width: 48, height: 32, channels: 3, background: { r: 12, g: 90, b: 200 } },
    });

  jpeg = await canvas().jpeg().toBuffer();
  png = await canvas().png().toBuffer();
  webp = await canvas().webp().toBuffer();
  gif = await canvas().gif().toBuffer();

  // A photo straight off a phone: same picture, plus where it was taken.
  jpegWithGps = withGpsExif(jpeg);

  hugeDimensions = await sharp({
    create: {
      width: MAX_IMAGE_DIMENSION + 800,
      height: MAX_IMAGE_DIMENSION + 400,
      channels: 3,
      background: { r: 5, g: 5, b: 5 },
    },
  })
    .png()
    .toBuffer();
});

describe("sniffImageType", () => {
  it("recognises the three accepted formats by their magic bytes", () => {
    expect(sniffImageType(jpeg)).toBe("image/jpeg");
    expect(sniffImageType(png)).toBe("image/png");
    expect(sniffImageType(webp)).toBe("image/webp");
  });

  it("refuses formats that are not on the allowlist", () => {
    expect(sniffImageType(gif)).toBeNull();
    expect(
      sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')),
    ).toBeNull();
    expect(sniffImageType(Buffer.from("%PDF-1.7\n%just a document"))).toBeNull();
    expect(sniffImageType(Buffer.from(""))).toBeNull();
  });

  it("ignores what the file claims to be — only the bytes count", () => {
    // The classic upload bypass: a script named "holiday.jpg", served with
    // image/jpeg. Nothing in this path ever sees the name or the header.
    const disguised = Buffer.from("#!/bin/sh\nrm -rf /\n");
    expect(sniffImageType(disguised)).toBeNull();

    // And the reverse: a real PNG whose name says otherwise is still a PNG.
    expect(sniffImageType(png)).toBe("image/png");
  });

  it("does not mistake a RIFF container that isn't WebP", () => {
    const wav = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from("WAVEfmt "),
    ]);
    expect(sniffImageType(wav)).toBeNull();
  });
});

describe("processImageUpload", () => {
  it("accepts a real image and re-encodes it to WebP", async () => {
    const result = await processImageUpload(png);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.image.contentType).toBe("image/webp");
    const meta = await sharp(result.image.data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(48);
    expect(meta.height).toBe(32);
  });

  it("strips EXIF, including GPS coordinates", async () => {
    // Guard the fixture itself: if it ever stops carrying real EXIF, the
    // assertions below would pass for the wrong reason.
    const before = await sharp(jpegWithGps).metadata();
    expect(before.exif).toBeDefined();
    expect(jpegWithGps.includes(Buffer.from("Exif"))).toBe(true);
    expect(jpegWithGps.includes(LATITUDE_BYTES)).toBe(true);

    const result = await processImageUpload(jpegWithGps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = await sharp(result.image.data).metadata();
    expect(after.exif).toBeUndefined();
    // Not just "the decoder reports no EXIF" — the coordinates are gone from
    // the stored bytes entirely.
    expect(result.image.data.includes(Buffer.from("Exif"))).toBe(false);
    expect(result.image.data.includes(LATITUDE_BYTES)).toBe(false);
  });

  it("rejects anything over the size cap", async () => {
    // Valid PNG magic bytes so this can only fail on size, never on sniffing.
    const oversized = Buffer.concat([png, Buffer.alloc(MAX_UPLOAD_BYTES)]);
    const result = await processImageUpload(oversized);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/larger than/i);
  });

  it("rejects a file whose extension lies about its contents", async () => {
    const notAnImage = Buffer.from("GET / HTTP/1.1\r\nHost: example.com\r\n\r\n");
    const result = await processImageUpload(notAnImage);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/renaming it won't help/i);
  });

  it("rejects SVG by name, because it can carry script", async () => {
    const svg = Buffer.from(
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">' +
        '<script>fetch("/api/media")</script></svg>',
    );
    const result = await processImageUpload(svg);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/SVG/);
  });

  it("rejects GIF and explains why", async () => {
    const result = await processImageUpload(gif);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/GIF/);
  });

  it("rejects an empty file", async () => {
    const result = await processImageUpload(new Uint8Array(0));
    expect(result.ok).toBe(false);
  });

  it("rejects a truncated image that starts out convincing", async () => {
    // Right magic bytes, no usable body — the sniffer waves it through and the
    // decoder is what catches it.
    const truncated = png.subarray(0, 40);
    expect(sniffImageType(truncated)).toBe("image/png");

    const result = await processImageUpload(truncated);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/couldn't be read/i);
  });

  it("caps the longest edge and keeps the aspect ratio", async () => {
    const result = await processImageUpload(hugeDimensions);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.image.width).toBe(MAX_IMAGE_DIMENSION);
    expect(result.image.height).toBeLessThan(MAX_IMAGE_DIMENSION);
    expect(result.image.data.length).toBeLessThanOrEqual(MAX_UPLOAD_BYTES);
  });

  it("leaves a small image small", async () => {
    const result = await processImageUpload(jpeg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.image.width).toBe(48);
    expect(result.image.height).toBe(32);
  });
});
