import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { CollabJoinForm } from "@/components/collab/CollabJoinForm";

export const metadata = { title: "Join a group quiz" };

export default async function CollabJoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const params = await searchParams;

  if (!(await getCurrentUser())) {
    // Preserve the code through the login round trip so a shared link still
    // lands the person where they expected.
    const next = params.code
      ? `/collab/join?code=${encodeURIComponent(params.code)}`
      : "/collab/join";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  return (
    <main
      id="main"
      className="flex min-h-dvh items-center justify-center bg-ink-50 px-5 py-12"
    >
      <div className="w-full max-w-sm">
        <Link
          href="/dashboard"
          className="mb-8 block text-center text-lg font-bold tracking-tight text-ink-900"
        >
          Quiz<span className="text-brand-600">zly</span>
        </Link>

        <div className="app-card p-6">
          <h1 className="text-xl font-bold text-ink-900">Join a group quiz</h1>
          <p className="mt-1 text-sm text-ink-600">
            Enter the invite code you were given. You&apos;ll write your own
            questions — nobody else sees them until the game.
          </p>
          <CollabJoinForm initialCode={params.code ?? ""} />
        </div>
      </div>
    </main>
  );
}
