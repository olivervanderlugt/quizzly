import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
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
      className="flex min-h-dvh items-center justify-center bg-ink-50 px-5 py-12"
    >
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-8 block text-center text-lg font-bold tracking-tight text-ink-900"
        >
          Quiz<span className="text-brand-600">zly</span>
        </Link>

        <div className="app-card p-6">
          <h1 className="text-xl font-bold text-ink-900">Welcome back</h1>
          <p className="mt-1 text-sm text-ink-600">
            Sign in to build and host quizzes.
          </p>
          <AuthForm mode="login" next={next} />
        </div>

        <p className="mt-5 text-center text-sm text-ink-600">
          No account yet?{" "}
          <Link href="/signup" className="font-medium text-brand-600 hover:underline">
            Create one
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-ink-500">
          Just here to play?{" "}
          <Link href="/" className="font-medium text-ink-700 hover:underline">
            Join with a PIN
          </Link>
        </p>
      </div>
    </main>
  );
}
