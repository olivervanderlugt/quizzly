import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getQuestionsFor } from "@/lib/collab";

/**
 * GDPR Article 15: everything Quizzly holds about the signed-in account, as
 * one JSON download.
 *
 * Two deliberate exclusions:
 *
 *  - Other people's data. Games the user hosted include player *counts*, never
 *    the players' nicknames — those belong to the players, and handing them to
 *    the host in bulk would undo the data minimisation the schema promises.
 *  - Unrevealed collab questions by other contributors. Questions are read
 *    through `getQuestionsFor`, the same blind read path the app uses, so an
 *    export cannot leak what the editor would refuse to show.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Not found", { status: 404 });

  const record = await db.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      displayName: true,
      createdAt: true,
      updatedAt: true,
      encryptedAiKey: true,
      quizzes: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          mode: true,
          visibility: true,
          theme: true,
          settings: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      hostedGames: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          status: true,
          createdAt: true,
          startedAt: true,
          endedAt: true,
          quiz: { select: { title: true } },
          _count: { select: { players: true } },
        },
      },
      contributions: {
        select: {
          joinedAt: true,
          quiz: { select: { id: true, title: true } },
        },
      },
    },
  });
  if (!record) return new Response("Not found", { status: 404 });

  const quizzes = [];
  for (const quiz of record.quizzes) {
    const questions = await getQuestionsFor(quiz.id, user.id);
    quizzes.push({
      ...quiz,
      questions: questions.filter((q) => q.visible),
    });
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    account: {
      id: record.id,
      email: record.email,
      displayName: record.displayName,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      // The key itself is encrypted and never leaves the server — the fact
      // that one is stored is the personal data, so that is what's exported.
      aiKeyStored: Boolean(record.encryptedAiKey),
    },
    quizzes,
    hostedGames: record.hostedGames.map((game) => ({
      id: game.id,
      quizTitle: game.quiz.title,
      status: game.status,
      createdAt: game.createdAt,
      startedAt: game.startedAt,
      endedAt: game.endedAt,
      playerCount: game._count.players,
    })),
    // Questions the user wrote into other people's group quizzes are their
    // data too — but only their own; `mine` is the blind path's own flag.
    contributions: await Promise.all(
      record.contributions.map(async (c) => ({
        quizId: c.quiz.id,
        quizTitle: c.quiz.title,
        joinedAt: c.joinedAt,
        myQuestions: (await getQuestionsFor(c.quiz.id, user.id)).filter(
          (q) => q.visible && q.mine,
        ),
      })),
    ),
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="quizzly-account-export.json"`,
      "cache-control": "no-store",
    },
  });
}
