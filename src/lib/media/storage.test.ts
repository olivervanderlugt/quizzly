import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Storage is the layer where a caller-supplied string could become a
 * filesystem path, so these tests are mostly about the paths that must never
 * resolve. The module reads the upload directory from validated env, which is
 * why it is imported dynamically after the environment is staged.
 */

let root: string;
let storage: typeof import("./storage");

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "quizzly-media-"));

  process.env.APP_ORIGIN = "http://localhost:3000";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.SESSION_SECRET = "test-session-secret-at-least-32-characters";
  process.env.ENCRYPTION_KEY = "test-encryption-key-at-least-32-characters";
  process.env.MEDIA_UPLOAD_DIR = root;

  storage = await import("./storage");
});

afterAll(() => {
  delete process.env.MEDIA_UPLOAD_DIR;
});

describe("storeMedia / readMedia", () => {
  it("round-trips an image and hands back a key that is only hex", async () => {
    const bytes = Buffer.from("pretend this is a webp");
    const key = await storage.storeMedia(bytes);

    expect(key).toMatch(/^[0-9a-f]{32}\.webp$/);
    await expect(storage.readMedia(key)).resolves.toEqual(bytes);
  });

  it("writes inside the configured root, never anywhere else", async () => {
    const key = await storage.storeMedia(Buffer.from("x"));
    const shard = key.slice(0, 2);

    const stored = await readFile(path.join(root, shard, key));
    expect(stored.toString()).toBe("x");
    expect(storage.mediaRoot()).toBe(path.resolve(root));
  });

  it("gives every upload its own key", async () => {
    const first = await storage.storeMedia(Buffer.from("one"));
    const second = await storage.storeMedia(Buffer.from("two"));

    expect(first).not.toBe(second);
    await expect(storage.readMedia(first)).resolves.toEqual(Buffer.from("one"));
  });

  it("returns null for a key that could not have come from here", async () => {
    // Each of these is a real attempt at reading something outside the root.
    for (const key of [
      "../../../etc/passwd",
      "..%2f..%2fetc%2fpasswd",
      "/etc/passwd",
      "0123456789abcdef0123456789abcdef.webp/../../../etc/passwd",
      "0123456789abcdef0123456789abcdef.png",
      "0123456789ABCDEF0123456789ABCDEF.webp",
      "0123456789abcdef0123456789abcde.webp",
      "",
    ]) {
      await expect(storage.readMedia(key)).resolves.toBeNull();
    }
  });

  it("returns null for a well-formed key nobody uploaded", async () => {
    await expect(
      storage.readMedia("ffffffffffffffffffffffffffffffff.webp"),
    ).resolves.toBeNull();
  });

  it("does not read a file that was planted outside the shard layout", async () => {
    // A file sitting in the root rather than in its shard directory is not
    // reachable: the key alone decides the path.
    const key = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp";
    await writeFile(path.join(root, key), "planted");

    await expect(storage.readMedia(key)).resolves.toBeNull();
    expect(await readdir(root)).toContain(key);
  });
});
