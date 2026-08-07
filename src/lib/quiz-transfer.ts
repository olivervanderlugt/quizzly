import { z } from "zod";

import {
  questionPayloadSchema,
  validatePayloadIntegrity,
} from "./question-schema";
import {
  DEFAULT_PRESENTATION,
  presentationSchema,
  themeSchema,
  validatePresentation,
} from "./theme";
import { quizSettingsSchema } from "./scoring";

/**
 * The quiz file format: what "export a quiz" writes and "import a quiz" reads.
 *
 * A transfer file is untrusted input like any other — it goes through the same
 * Zod schemas and integrity checks a hand-written question faces, so a crafted
 * file cannot smuggle an invalid row into the database. Unknown fields are
 * dropped by Zod rather than preserved, which is what makes old exports safe
 * to open in newer versions.
 *
 * `version` is checked with `<=` on import so today's app opens today's files
 * and refuses tomorrow's, with a message that says so, instead of failing
 * somewhere deeper with a shape error.
 */

export const QUIZ_TRANSFER_FORMAT = "quizzly-quiz";
export const QUIZ_TRANSFER_VERSION = 1;

const transferQuestionSchema = z.object({
  prompt: z.string().trim().min(1).max(500),
  payload: questionPayloadSchema,
  presentation: presentationSchema.optional(),
  timeLimitSec: z.number().int().min(5).max(300).default(20),
  points: z.number().int().min(0).max(10_000).default(1000),
  explanation: z.string().trim().max(500).nullish(),
});

const quizTransferSchema = z.object({
  format: z.literal(QUIZ_TRANSFER_FORMAT),
  version: z.number().int().min(1),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullish(),
  theme: themeSchema,
  settings: quizSettingsSchema,
  questions: z.array(transferQuestionSchema).min(1),
});

export type QuizTransfer = z.infer<typeof quizTransferSchema>;
export type TransferQuestion = z.infer<typeof transferQuestionSchema>;

export interface ExportableQuiz {
  title: string;
  description: string | null;
  theme: unknown;
  settings: unknown;
  questions: Array<{
    prompt: string;
    payload: unknown;
    presentation: unknown;
    timeLimitSec: number;
    points: number;
    explanation: string | null;
  }>;
}

/** Build the file content for an export. Throws on a corrupt database row. */
export function toTransfer(quiz: ExportableQuiz): QuizTransfer {
  return quizTransferSchema.parse({
    format: QUIZ_TRANSFER_FORMAT,
    version: QUIZ_TRANSFER_VERSION,
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
}

export type ParseResult =
  | { ok: true; data: QuizTransfer }
  | { ok: false; error: string };

export function parseQuizTransfer(
  raw: unknown,
  maxQuestions: number,
): ParseResult {
  // Look at format/version first so the common failure modes get a message a
  // person can act on, rather than a generic "invalid file".
  const head = z
    .object({ format: z.unknown(), version: z.unknown() })
    .safeParse(raw);
  if (!head.success || head.data.format !== QUIZ_TRANSFER_FORMAT) {
    return { ok: false, error: "That file isn't a Quizzly quiz export." };
  }
  if (
    typeof head.data.version !== "number" ||
    head.data.version > QUIZ_TRANSFER_VERSION
  ) {
    return {
      ok: false,
      error: "That file came from a newer Quizzly than this one.",
    };
  }

  const parsed = quizTransferSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "That file is damaged or incomplete." };
  }

  if (parsed.data.questions.length > maxQuestions) {
    return {
      ok: false,
      error: `A quiz can hold at most ${maxQuestions} questions.`,
    };
  }

  // The schemas check shape; these check meaning (a correct option that
  // exists, slider bounds that contain the answer, and so on).
  for (const question of parsed.data.questions) {
    const integrity = validatePayloadIntegrity(question.payload);
    if (!integrity.ok) {
      return { ok: false, error: `"${question.prompt.slice(0, 40)}": ${integrity.error}` };
    }
    const presentation = validatePresentation(
      question.presentation ?? DEFAULT_PRESENTATION,
    );
    if (!presentation.ok) {
      return { ok: false, error: `"${question.prompt.slice(0, 40)}": ${presentation.error}` };
    }
  }

  return { ok: true, data: parsed.data };
}

/** A filesystem-safe filename for an export, e.g. "friday-pub-quiz.quizzly.json". */
export function transferFilename(title: string): string {
  const slug =
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "quiz";
  return `${slug}.quizzly.json`;
}
