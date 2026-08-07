import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "./db";
import {
  generateSessionToken,
  hashSessionToken,
  hashPassword,
  verifyPassword,
} from "./crypto";
import {
  createPasswordReset,
  consumePasswordReset,
} from "./password-reset";

/**
 * The password reset flow against a real database: issue, redeem, single-use,
 * expiry, and the log-out-everywhere side effect. The Server Action on top
 * adds only rate limiting and the email send.
 */

const EMAIL = "e2e-reset@test.local";

let userId: string;

async function cleanup(): Promise<void> {
  await db.user.deleteMany({ where: { email: EMAIL } });
}

beforeAll(async () => {
  await cleanup();
  const user = await db.user.create({
    data: {
      email: EMAIL,
      passwordHash: await hashPassword("original-password"),
      displayName: "Reset Tester",
    },
  });
  userId = user.id;
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("password reset", () => {
  it("returns null for an unknown email, a token for a known one", async () => {
    expect(await createPasswordReset("nobody@test.local")).toBeNull();

    const issued = await createPasswordReset(EMAIL);
    expect(issued).not.toBeNull();
    expect(issued!.userId).toBe(userId);

    // Only the hash is stored — the raw token must not appear in the table.
    const row = await db.passwordResetToken.findUnique({
      where: { id: hashSessionToken(issued!.token) },
    });
    expect(row).not.toBeNull();
    expect(row!.id).not.toBe(issued!.token);
  });

  it("a new request invalidates the previous link", async () => {
    const first = await createPasswordReset(EMAIL);
    const second = await createPasswordReset(EMAIL);

    expect(await consumePasswordReset(first!.token, "irrelevant-1234")).toEqual({
      ok: false,
    });
    // The newest link still works.
    const result = await consumePasswordReset(second!.token, "next-password-1");
    expect(result.ok).toBe(true);
  });

  it("redeeming sets the password, kills sessions, and is single-use", async () => {
    // Give the account a live session that must die with the reset.
    await db.session.create({
      data: {
        id: hashSessionToken(generateSessionToken()),
        userId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const issued = await createPasswordReset(EMAIL);
    const result = await consumePasswordReset(issued!.token, "brand-new-password");
    expect(result).toEqual({ ok: true, userId });

    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await verifyPassword("brand-new-password", user.passwordHash)).toBe(true);
    expect(await verifyPassword("original-password", user.passwordHash)).toBe(false);

    expect(await db.session.count({ where: { userId } })).toBe(0);

    // Same link again: dead.
    expect(await consumePasswordReset(issued!.token, "another-password-1")).toEqual({
      ok: false,
    });
  });

  it("rejects garbage and expired tokens", async () => {
    expect(await consumePasswordReset("not-a-real-token", "whatever-12345")).toEqual({
      ok: false,
    });

    const issued = await createPasswordReset(EMAIL);
    await db.passwordResetToken.update({
      where: { id: hashSessionToken(issued!.token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await consumePasswordReset(issued!.token, "whatever-12345")).toEqual({
      ok: false,
    });
    // An expired token is deleted on sight.
    expect(
      await db.passwordResetToken.findUnique({
        where: { id: hashSessionToken(issued!.token) },
      }),
    ).toBeNull();
  });
});
