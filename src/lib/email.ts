import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

import { env, emailConfigured } from "./env";

/**
 * Outbound email — used for exactly one thing: password reset.
 *
 * Deliberately plain SMTP rather than a provider SDK, so the operator can plug
 * in anything that speaks SMTP (Resend, Postmark, Mailgun, a workspace
 * account) by setting four env vars, and swap providers without a code change.
 *
 * Like AI generation, this is optional: without SMTP_HOST/EMAIL_FROM the app
 * runs fine and password reset simply isn't offered. Callers must check
 * `emailConfigured` before offering email-dependent features.
 */

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!emailConfigured) {
    // Callers gate on `emailConfigured`, so reaching this is a programming
    // error, not a user-facing condition.
    throw new Error("Email is not configured — check emailConfigured first");
  }
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // `secure: true` means TLS from the first byte (port 465). The default
    // (587) uses STARTTLS, which nodemailer negotiates automatically.
    secure: env.SMTP_SECURE === "true",
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
  });
  return transporter;
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
): Promise<void> {
  await getTransporter().sendMail({
    from: env.EMAIL_FROM,
    to,
    subject: "Reset your Quizzly password",
    text:
      `Someone asked to reset the password for the Quizzly account under this ` +
      `address. If that was you, open the link below within 30 minutes:\n\n` +
      `${resetUrl}\n\n` +
      `If it wasn't you, ignore this email — nothing has changed and the link ` +
      `expires on its own.`,
    // Kept deliberately simple: no images, no tracking, degrades to the text
    // part in clients that block HTML.
    html:
      `<p>Someone asked to reset the password for the Quizzly account under ` +
      `this address. If that was you, open the link below within 30 minutes:</p>` +
      `<p><a href="${resetUrl}">${resetUrl}</a></p>` +
      `<p>If it wasn't you, ignore this email — nothing has changed and the ` +
      `link expires on its own.</p>`,
  });
}
