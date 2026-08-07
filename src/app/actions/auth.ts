"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";

import {
  authenticate,
  createSession,
  destroySession,
  registerUser,
} from "@/lib/auth";
import { env, emailConfigured } from "@/lib/env";
import { sendPasswordResetEmail } from "@/lib/email";
import {
  createPasswordReset,
  consumePasswordReset,
} from "@/lib/password-reset";
import { consume, reset, RULES } from "@/lib/rate-limit";
import { passwordSchema } from "@/lib/password-policy";

/**
 * Auth server actions.
 *
 * Next.js gives Server Actions built-in CSRF protection: it compares the Origin
 * and Host headers and rejects mismatches, so a form on another site cannot
 * invoke these. What it does *not* give us is brute-force protection, so that
 * is handled explicitly below.
 */

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Set on success for forms that stay on the page instead of redirecting. */
  message?: string;
}


const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: passwordSchema,
  displayName: z
    .string()
    .trim()
    .min(1, "Tell us what to call you.")
    .max(40, "That name is too long."),
  // The age gate docs/LEGAL.md requires before opening signup to strangers.
  // A checkbox posts "on"; we store nothing — the assertion is the point.
  ageConfirm: z.literal("on", {
    errorMap: () => ({
      message: "Confirm you're old enough to create an account.",
    }),
  }),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

/**
 * A coarse client identifier for rate limiting.
 *
 * Behind a reverse proxy `x-forwarded-for` is the client address; direct, it's
 * absent and everyone shares one bucket. That is acceptable for login limiting
 * (the failure mode is stricter limiting, not weaker), but never use this for
 * anything security-critical — a client can set the header freely unless your
 * proxy overwrites it. See docs/DEPLOYMENT.md.
 */
async function clientKey(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

export async function signupAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
    ageConfirm: formData.get("ageConfirm"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { fieldErrors };
  }

  const key = await clientKey();
  if (!consume(`signup:${key}`, RULES.signup).allowed) {
    return { error: "Too many accounts created from here. Try again later." };
  }

  const result = await registerUser(parsed.data);
  if (!result.ok) return { error: result.error };

  await createSession(result.userId);
  redirect("/dashboard");
}

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Enter your email and password." };
  }

  const key = await clientKey();

  // Limited by IP *and* by the email being targeted, so one attacker cannot
  // spread attempts across many addresses to stay under an IP-only limit.
  const ipLimit = consume(`login:ip:${key}`, RULES.login);
  const emailLimit = consume(`login:email:${parsed.data.email}`, RULES.login);

  if (!ipLimit.allowed || !emailLimit.allowed) {
    const retryMs = Math.max(ipLimit.retryAfterMs, emailLimit.retryAfterMs);
    const minutes = Math.ceil(retryMs / 60_000);
    return {
      error: `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    };
  }

  const result = await authenticate(parsed.data.email, parsed.data.password);
  if (!result.ok) return { error: result.error };

  // A successful login clears the counters — otherwise a user who mistyped
  // twice stays near the threshold for the rest of the window.
  reset(`login:ip:${key}`);
  reset(`login:email:${parsed.data.email}`);

  await createSession(result.userId);

  const next = formData.get("next");
  // Only ever redirect to a path on this site. Accepting an absolute URL here
  // would turn the login form into an open redirect.
  const target =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/dashboard";

  redirect(target);
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}

// ─────────────────────────────── Password reset ──────────────────────────────

const requestResetSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
});

/**
 * Ask for a reset link.
 *
 * The response is identical whether or not an account exists — and the token
 * creation and email send happen after the response, fire-and-forget, so not
 * even response latency distinguishes the two. The email is the only channel
 * that ever confirms an account's existence, and it goes to the account owner.
 */
export async function requestPasswordResetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = requestResetSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: "Enter a valid email address." };
  }

  const key = await clientKey();
  const ipLimit = consume(`reset:ip:${key}`, RULES.passwordReset);
  const emailLimit = consume(
    `reset:email:${parsed.data.email}`,
    RULES.passwordReset,
  );
  if (!ipLimit.allowed || !emailLimit.allowed) {
    return { error: "Too many reset requests. Try again in a while." };
  }

  if (emailConfigured) {
    const email = parsed.data.email;
    void (async () => {
      const issued = await createPasswordReset(email);
      if (!issued) return;
      const url = `${env.APP_ORIGIN}/reset-password?token=${encodeURIComponent(issued.token)}`;
      await sendPasswordResetEmail(email, url);
    })().catch((err) => {
      // Log-and-swallow is deliberate: surfacing a send failure to the form
      // would turn the SMTP relay into an account-existence oracle.
      console.error("[auth] password reset issue failed", err);
    });
  }

  return {
    message:
      "If an account exists under that address, a reset link is on its way. " +
      "It expires in 30 minutes.",
  };
}

const resetSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const passwordIssue = parsed.error.issues.find(
      (i) => i.path[0] === "password",
    );
    return passwordIssue
      ? { fieldErrors: { password: passwordIssue.message } }
      : { error: "That reset link is not valid." };
  }

  // Redeeming is cheap for the server but each attempt burns nothing for an
  // attacker without a valid token (256 bits — unguessable), so a modest IP
  // limit is enough to keep the endpoint from being used as a hash-cracking
  // treadmill via the scrypt call.
  const key = await clientKey();
  if (!consume(`reset:redeem:${key}`, RULES.passwordReset).allowed) {
    return { error: "Too many attempts. Try again in a while." };
  }

  const result = await consumePasswordReset(parsed.data.token, parsed.data.password);
  if (!result.ok) {
    return {
      error:
        "That reset link has expired or was already used. Request a new one.",
    };
  }

  redirect("/login?reset=done");
}
