import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { reviewSubmissions } from "@/lib/collab";
import { describeCorrectAnswer } from "@/lib/question-schema";
import { removeSubmissionAction } from "@/app/actions/collab";

export const metadata = { title: "Review submissions" };

/**
 * The moderation escape hatch.
 *
 * Merely loading this page stamps `ownerReviewedAt` and tells every
 * contributor. That is intentional: hosts running this with students need to be
 * able to check for something abusive, but a silent backdoor would make the
 * promise the feature makes to contributors untrue.
 */
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/collab/${id}/review`);

  const result = await reviewSubmissions(id, user.id);
  if (!result.ok) notFound();

  return (
    <div className="min-h-dvh bg-ink-50">
      <header className="border-b border-ink-200">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link
            href={`/collab/${id}`}
            className="text-sm text-ink-600 hover:text-ink-900"
          >
            ← Back
          </Link>
          <span className="text-sm text-ink-600">Moderation</span>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-2xl font-bold text-ink-900">Submitted questions</h1>

        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {result.firstReview
            ? "Every contributor has now been told you reviewed the submissions. You've also spoiled the quiz for yourself — consider having someone else host."
            : "You've reviewed these before. Contributors have been told."}
        </p>

        <ul className="mt-6 space-y-3">
          {result.questions.map((question, index) => (
            <li key={question.id} className="app-card p-5">
              <div className="flex items-start gap-3">
                <span className="numeric mt-0.5 w-6 text-center text-sm text-ink-500">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink-900">
                    {question.prompt || "(no prompt)"}
                  </p>
                  <p className="mt-1.5 text-sm text-ink-600">
                    Answer:{" "}
                    <span className="text-ink-700">
                      {describeCorrectAnswer(question.payload)}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    {question.type}
                    {question.authorName ? ` · by ${question.authorName}` : ""}
                  </p>
                </div>

                <form action={removeSubmissionAction}>
                  <input type="hidden" name="questionId" value={question.id} />
                  <input type="hidden" name="quizId" value={id} />
                  <button
                    type="submit"
                    className="btn btn-ghost py-1.5 text-sm text-red-600"
                  >
                    Remove
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
