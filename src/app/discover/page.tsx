import Link from "next/link";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { copyQuizAction, startGameAction } from "@/app/actions/quiz";

export const metadata = { title: "Discover quizzes" };

/**
 * Public quiz gallery. Browsing needs no account — quiz titles carry no
 * answers — but hosting or copying does, so signed-out visitors get a login
 * link where signed-in users get the buttons.
 *
 * Only metadata is ever selected here. Question payloads contain correct
 * answers and must not pass through a public listing.
 */
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; q?: string }>;
}) {
  const [user, { error, q }] = await Promise.all([getCurrentUser(), searchParams]);
  const query = (q ?? "").trim().slice(0, 100);

  const quizzes = await db.quiz.findMany({
    where: {
      visibility: "PUBLIC",
      mode: "SOLO",
      questions: { some: {} },
      ...(query
        ? {
            OR: [
              { title: { contains: query, mode: "insensitive" as const } },
              { description: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 60,
    select: {
      id: true,
      title: true,
      description: true,
      coverImage: true,
      updatedAt: true,
      owner: { select: { displayName: true } },
      _count: { select: { questions: true, games: true } },
    },
  });

  return (
    <div className="min-h-dvh bg-ink-50">
      <header className="border-b border-ink-200">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link href="/" className="font-bold tracking-tight text-ink-900">
            Quiz<span className="text-brand-600">zly</span>
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            {user ? (
              <Link href="/dashboard" className="btn btn-ghost py-1.5 text-sm">
                Your quizzes
              </Link>
            ) : (
              <>
                <Link href="/login?next=/discover" className="btn btn-ghost py-1.5 text-sm">
                  Sign in
                </Link>
                <Link href="/signup" className="btn btn-primary py-1.5 text-sm">
                  Create account
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-5 py-8">
        <h1 className="text-2xl font-bold text-ink-900">Discover</h1>
        <p className="mt-2 max-w-2xl text-ink-600">
          Quizzes other people have made public. Host one as-is, or save a copy
          and make it yours — no need to write a quiz from scratch every time.
        </p>

        {error === "empty" ? (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            That quiz has no questions to play.
          </p>
        ) : null}
        {error === "pin" ? (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Couldn&apos;t find a free game PIN — try again.
          </p>
        ) : null}

        <form method="get" action="/discover" className="mt-6 flex max-w-md gap-2">
          <label className="sr-only" htmlFor="q">
            Search public quizzes
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query}
            maxLength={100}
            placeholder="Search by title or description"
            className="app-input"
          />
          <button type="submit" className="btn btn-ghost">
            Search
          </button>
        </form>

        <section className="mt-8">
          {quizzes.length === 0 ? (
            <p className="app-card p-8 text-center text-ink-600">
              {query ? (
                <>Nothing public matches &quot;{query}&quot;.</>
              ) : (
                <>
                  Nothing public yet. Make one of your quizzes public from its
                  editor under Game rules → Sharing, and it will show up here.
                </>
              )}
            </p>
          ) : (
            <ul className="space-y-3">
              {quizzes.map((quiz) => (
                <li
                  key={quiz.id}
                  className="app-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center"
                >
                  {quiz.coverImage ? (
                    // Decorative — the title beside it is the accessible name.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={quiz.coverImage}
                      alt=""
                      className="h-16 w-24 shrink-0 rounded-lg border border-ink-200 object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-semibold text-ink-900">
                      {quiz.title}
                    </h2>
                    {quiz.description ? (
                      <p className="mt-1 line-clamp-2 text-sm text-ink-600">
                        {quiz.description}
                      </p>
                    ) : null}
                    <p className="mt-1 text-sm text-ink-500">
                      {quiz._count.questions} question
                      {quiz._count.questions === 1 ? "" : "s"} · by{" "}
                      {quiz.owner.displayName}
                      {quiz._count.games > 0
                        ? ` · played ${quiz._count.games} time${quiz._count.games === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {user ? (
                      <>
                        <form action={copyQuizAction}>
                          <input type="hidden" name="quizId" value={quiz.id} />
                          <button type="submit" className="btn btn-ghost py-1.5 text-sm">
                            Save a copy
                          </button>
                        </form>
                        <form action={startGameAction}>
                          <input type="hidden" name="quizId" value={quiz.id} />
                          <button type="submit" className="btn btn-primary py-1.5 text-sm">
                            Host
                          </button>
                        </form>
                      </>
                    ) : (
                      <Link
                        href="/login?next=/discover"
                        className="btn btn-primary py-1.5 text-sm"
                      >
                        Sign in to host
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
