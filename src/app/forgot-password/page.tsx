import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { emailConfigured } from "@/lib/env";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export const metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <main
      id="main"
      className="flex min-h-dvh items-center justify-center bg-ink-950 px-5 py-12"
    >
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-8 block text-center text-lg font-bold tracking-tight text-white"
        >
          Quiz<span className="text-brand-400">zly</span>
        </Link>

        <div className="app-card p-6">
          <h1 className="text-xl font-bold text-white">Reset your password</h1>
          {emailConfigured ? (
            <>
              <p className="mt-1 text-sm text-ink-400">
                Enter your account email and we&apos;ll send a reset link.
              </p>
              <ForgotPasswordForm />
            </>
          ) : (
            // Honest degradation, same idea as the AI panel: say what's off and
            // why, rather than presenting a form that goes nowhere.
            <p className="mt-1 text-sm leading-relaxed text-ink-400">
              This server can&apos;t send email, so automatic password reset is
              switched off. Contact whoever runs it — they can reset your
              password directly, or switch reset on by configuring SMTP.
            </p>
          )}
        </div>

        <p className="mt-5 text-center text-sm text-ink-400">
          Remembered it after all?{" "}
          <Link href="/login" className="font-medium text-brand-400 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
