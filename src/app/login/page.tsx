import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { emailConfigured } from "@/lib/env";
import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  if (await getCurrentUser()) redirect("/dashboard");

  const params = await searchParams;
  const next =
    params.next?.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : undefined;

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
          <h1 className="text-xl font-bold text-white">Welcome back</h1>
          <p className="mt-1 text-sm text-ink-400">
            Sign in to build and host quizzes.
          </p>

          {params.reset === "done" ? (
            <p
              role="status"
              className="mt-4 rounded-lg border border-emerald-900 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300"
            >
              Password updated. Sign in with the new one.
            </p>
          ) : null}

          <AuthForm mode="login" next={next} />

          {emailConfigured ? (
            <p className="mt-4 text-center text-sm">
              <Link
                href="/forgot-password"
                className="font-medium text-ink-400 hover:text-ink-200 hover:underline"
              >
                Forgot your password?
              </Link>
            </p>
          ) : null}
        </div>

        <p className="mt-5 text-center text-sm text-ink-400">
          No account yet?{" "}
          <Link href="/signup" className="font-medium text-brand-400 hover:underline">
            Create one
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-ink-500">
          Just here to play?{" "}
          <Link href="/" className="font-medium text-ink-300 hover:underline">
            Join with a PIN
          </Link>
        </p>
      </div>
    </main>
  );
}
