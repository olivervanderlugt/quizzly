import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export const metadata = { title: "Set a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  if (await getCurrentUser()) redirect("/dashboard");

  const { token } = await searchParams;

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
          <h1 className="text-xl font-bold text-white">Set a new password</h1>
          {token ? (
            <ResetPasswordForm token={token} />
          ) : (
            <p className="mt-1 text-sm leading-relaxed text-ink-400">
              This page only works from the link in a reset email, and this
              visit didn&apos;t come with one.{" "}
              <Link
                href="/forgot-password"
                className="font-medium text-brand-400 hover:underline"
              >
                Request a reset link
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
