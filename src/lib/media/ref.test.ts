import { describe, expect, it } from "vitest";

import { isUploadedMediaPath, mediaPathForKey, mediaReferenceSchema } from "./ref";
import { presentationSchema, validatePresentation } from "../theme";

const KEY = "0123456789abcdef0123456789abcdef.webp";
const PATH = mediaPathForKey(KEY);

describe("isUploadedMediaPath", () => {
  it("accepts a path this app could have issued", () => {
    expect(isUploadedMediaPath(PATH)).toBe(true);
  });

  it("rejects anything else that starts with the prefix", () => {
    // The regex is the traversal defence, so these are the cases that matter.
    expect(isUploadedMediaPath("/api/media/../../etc/passwd")).toBe(false);
    expect(isUploadedMediaPath("/api/media/0123456789abcdef0123456789abcdef.svg")).toBe(false);
    expect(isUploadedMediaPath("/api/media/NOTHEX89abcdef0123456789abcdef.webp")).toBe(false);
    expect(isUploadedMediaPath("/api/media/short.webp")).toBe(false);
    expect(isUploadedMediaPath(`${PATH}/../../secret`)).toBe(false);
    expect(isUploadedMediaPath(`https://evil.test${PATH}`)).toBe(false);
    expect(isUploadedMediaPath("/api/media/")).toBe(false);
  });
});

describe("mediaReferenceSchema", () => {
  it("still accepts a pasted external URL", () => {
    expect(mediaReferenceSchema.safeParse("https://example.com/bus.jpg").success).toBe(true);
  });

  it("accepts an uploaded image's path", () => {
    expect(mediaReferenceSchema.safeParse(PATH).success).toBe(true);
  });

  it("does not accept just any string", () => {
    expect(mediaReferenceSchema.safeParse("/api/media/whatever").success).toBe(false);
    expect(mediaReferenceSchema.safeParse("/uploads/photo.webp").success).toBe(false);
    expect(mediaReferenceSchema.safeParse("bus.jpg").success).toBe(false);
    expect(mediaReferenceSchema.safeParse("").success).toBe(false);
  });
});

describe("presentation with an uploaded image", () => {
  it("saves an upload on every layout that needs an image", () => {
    for (const layout of ["mediaTop", "mediaSplit", "banner"] as const) {
      const parsed = presentationSchema.safeParse({
        layout,
        media: PATH,
        mediaAlt: "A red bus on a bridge",
        hideTimer: false,
      });
      expect(parsed.success).toBe(true);
      if (!parsed.success) continue;
      expect(validatePresentation(parsed.data)).toEqual({ ok: true });
    }
  });

  it("still demands alt text for an upload, same as for a URL", () => {
    const parsed = presentationSchema.parse({ layout: "mediaTop", media: PATH });
    expect(validatePresentation(parsed).ok).toBe(false);
  });
});
