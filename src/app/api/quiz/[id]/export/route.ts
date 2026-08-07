import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { toTransfer, transferFilename } from "@/lib/quiz-transfer";

/**
 * Download a quiz as a file: your own solo quizzes, or anyone's public one.
 *
 * Sign-in is required even for public quizzes so the bar matches the rest of
 * the app — a public quiz's answers are reachable by any account (host it, or
 * save a copy and open the editor), but never by an anonymous player
 * mid-game. COLLAB is excluded entirely: an export would bypass the blind
 * read path in src/lib/collab.ts.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Not found", { status: 404 });

  const quiz = await db.quiz.findUnique({
    where: { id },
    select: {
      ownerId: true,
      visibility: true,
      mode: true,
      title: true,
      description: true,
      theme: true,
      settings: true,
      questions: { orderBy: { order: "asc" } },
    },
  });

  const allowed =
    quiz &&
    quiz.mode === "SOLO" &&
    (quiz.ownerId === user.id || quiz.visibility === "PUBLIC");
  // Same body for "doesn't exist" and "isn't yours" — no existence oracle.
  if (!quiz || !allowed) return new Response("Not found", { status: 404 });

  const file = toTransfer({
    title: quiz.title,
    description: quiz.description,
    theme: quiz.theme,
    settings: quiz.settings,
    questions: quiz.questions.map((q) => ({
      prompt: q.prompt,
      payload: q.payload,
      presentation: q.presentation,
      timeLimitSec: q.timeLimitSec,
      points: q.points,
      explanation: q.explanation,
    })),
  });

  return new Response(JSON.stringify(file, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${transferFilename(quiz.title)}"`,
      "cache-control": "no-store",
    },
  });
}
