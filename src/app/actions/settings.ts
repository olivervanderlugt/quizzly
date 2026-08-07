"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import {
  createSession,
  destroyAllSessions,
  requireUser,
} from "@/lib/auth";
import {
  encryptSecret,
  hashPassword,
  verifyPassword,
} from "@/lib/crypto";
import { passwordSchema } from "@/lib/password-policy";
import type { ActionState } from "./quiz";

/**
 * Saving a personal Anthropic API key.
 *
 * Stored AES-256-GCM encrypted, and never sent back to the browser — the
 * settings page can only report whether one is set, not what it is. There is
 * deliberately no "reveal key" feature: the user already has the key, and a
 * read path is only useful to an attacker.
 */
export async function saveAiKeyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const raw = String(formData.get("apiKey") ?? "").trim();

  if (raw === "") {
    await db.user.update({
      where: { id: user.id },
      data: { encryptedAiKey: null },
    });
    revalidatePath("/settings");
    return { ok: true, message: "Key removed. You'll use the server's key, if it has one." };
  }

  // Cheap shape check to catch a pasted-wrong-thing before it reaches the API.
  if (!raw.startsWith("sk-ant-") || raw.length < 30) {
    return { error: "That doesn't look like an Anthropic API key (they start with `sk-ant-`)." };
  }

  await db.user.update({
    where: { id: user.id },
    data: { encryptedAiKey: encryptSecret(raw) },
  });

  revalidatePath("/settings");
  return { ok: true, message: "Key saved and encrypted." };
}

/**
 * Password change.
 *
 * Requires the current password even though the caller has a session — a
 * borrowed laptop must not be enough to lock the owner out of their own
 * account. On success every session dies (`destroyAllSessions` finally has the
 * caller its doc comment always promised) and this device gets a fresh one, so
 * the user who just proved they hold the password stays signed in while anyone
 * else is out.
 */
export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const current = String(formData.get("currentPassword") ?? "");
  const parsed = passwordSchema.safeParse(formData.get("newPassword"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid password." };
  }

  const record = await db.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!record || !(await verifyPassword(current, record.passwordHash))) {
    return { error: "Your current password didn't match." };
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data) },
  });

  await destroyAllSessions(user.id);
  await createSession(user.id);

  revalidatePath("/settings");
  return {
    ok: true,
    message: "Password changed. Every other device has been signed out.",
  };
}

/**
 * Account deletion.
 *
 * A hard delete, not a soft flag. Quizzes, questions, games, players and
 * answers all cascade. This is the GDPR Article 17 path and it has to actually
 * delete — see docs/LEGAL.md.
 */
export async function deleteAccountAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  // Typing your own email is a deliberate speed bump on an irreversible action.
  const confirmation = String(formData.get("confirmEmail") ?? "").trim().toLowerCase();
  if (confirmation !== user.email.toLowerCase()) {
    redirect("/settings?error=confirm");
  }

  await destroyAllSessions(user.id);
  await db.user.delete({ where: { id: user.id } });

  redirect("/");
}
