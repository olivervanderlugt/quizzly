import { db } from "./db";
import {
  generateSessionToken,
  hashSessionToken,
  hashPassword,
} from "./crypto";

/**
 * Password reset — the database half.
 *
 * Deliberately not `server-only` (unlike src/lib/auth.ts): nothing here touches
 * cookies or request state, and keeping it importable from plain Node is what
 * lets the integration tests drive the full flow against a real database.
 * The Server Actions in src/app/actions/auth.ts add the request-scoped parts:
 * rate limiting, the email send, and the always-identical response.
 *
 * Tokens follow the Session pattern exactly: 256 bits of entropy, only the
 * SHA-256 hash stored, so a database leak cannot be redeemed.
 */

export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/**
 * Issue a reset token for the account under `email`, if one exists.
 *
 * Returns the raw token (for the emailed link) or null when there is no such
 * account. The caller must not let that difference reach the response —
 * "no account" and "email sent" have to look identical from outside.
 */
export async function createPasswordReset(
  email: string,
): Promise<{ token: string; userId: string } | null> {
  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true },
  });
  if (!user) return null;

  const token = generateSessionToken();

  await db.$transaction([
    // One outstanding token per account: a new request invalidates the old
    // link, and an attacker hammering the form can't stockpile valid tokens.
    db.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    db.passwordResetToken.create({
      data: {
        id: hashSessionToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    }),
  ]);

  return { token, userId: user.id };
}

/**
 * Redeem a token: set the new password and log the account out everywhere.
 *
 * Single-use by construction — redeeming deletes every token for the account,
 * and every session with them. Whoever holds the emailed link proved control
 * of the mailbox; any session an attacker might already hold dies here.
 */
export async function consumePasswordReset(
  token: string,
  newPassword: string,
): Promise<{ ok: true; userId: string } | { ok: false }> {
  const row = await db.passwordResetToken.findUnique({
    where: { id: hashSessionToken(token) },
    select: { userId: true, expiresAt: true },
  });
  if (!row) return { ok: false };

  if (row.expiresAt.getTime() < Date.now()) {
    await db.passwordResetToken
      .delete({ where: { id: hashSessionToken(token) } })
      .catch(() => {});
    return { ok: false };
  }

  const passwordHash = await hashPassword(newPassword);

  await db.$transaction([
    db.user.update({ where: { id: row.userId }, data: { passwordHash } }),
    db.passwordResetToken.deleteMany({ where: { userId: row.userId } }),
    db.session.deleteMany({ where: { userId: row.userId } }),
  ]);

  return { ok: true, userId: row.userId };
}
