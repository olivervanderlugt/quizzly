import { describe, expect, it } from "vitest";

import {
  parseQuizTransfer,
  toTransfer,
  transferFilename,
  QUIZ_TRANSFER_FORMAT,
  QUIZ_TRANSFER_VERSION,
} from "./quiz-transfer";
import { DEFAULT_THEME, DEFAULT_PRESENTATION } from "./theme";
import { DEFAULT_SETTINGS } from "./scoring";

const MAX = 100;

function validFile() {
  return {
    format: QUIZ_TRANSFER_FORMAT,
    version: QUIZ_TRANSFER_VERSION,
    title: "Friday pub quiz",
    description: "A test quiz.",
    theme: DEFAULT_THEME,
    settings: DEFAULT_SETTINGS,
    questions: [
      {
        prompt: "Which planet is closest to the Sun?",
        payload: {
          type: "MULTIPLE_CHOICE",
          options: [
            { id: "a", text: "Mercury" },
            { id: "b", text: "Venus" },
          ],
          correctId: "a",
        },
        presentation: DEFAULT_PRESENTATION,
        timeLimitSec: 20,
        points: 1000,
        explanation: null,
      },
      {
        prompt: "The Earth is flat.",
        payload: { type: "TRUE_FALSE", correct: false },
        timeLimitSec: 15,
        points: 500,
      },
    ],
  };
}

describe("parseQuizTransfer", () => {
  it("accepts a valid file", () => {
    const result = parseQuizTransfer(validFile(), MAX);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.title).toBe("Friday pub quiz");
      expect(result.data.questions).toHaveLength(2);
    }
  });

  it("rejects files that aren't quiz exports, with a specific message", () => {
    for (const raw of [null, 42, "quiz", {}, { format: "something-else" }]) {
      const result = parseQuizTransfer(raw, MAX);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/isn't a Quizzly quiz/);
    }
  });

  it("refuses files from a newer version rather than half-reading them", () => {
    const file = { ...validFile(), version: QUIZ_TRANSFER_VERSION + 1 };
    const result = parseQuizTransfer(file, MAX);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/newer Quizzly/);
  });

  it("rejects a structurally damaged file", () => {
    const file = validFile();
    (file.questions[0] as { payload: unknown }).payload = { type: "MULTIPLE_CHOICE" };
    expect(parseQuizTransfer(file, MAX).ok).toBe(false);
  });

  it("runs integrity checks, not just shape checks", () => {
    const file = validFile();
    // Structurally valid, semantically wrong: correctId points at no option.
    (file.questions[0]!.payload as { correctId: string }).correctId = "ghost";
    const result = parseQuizTransfer(file, MAX);
    expect(result.ok).toBe(false);
  });

  it("enforces the question cap", () => {
    const file = validFile();
    expect(parseQuizTransfer(file, 1).ok).toBe(false);
  });

  it("fills defaults for optional fields", () => {
    const result = parseQuizTransfer(validFile(), MAX);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Second question omitted presentation and explanation.
      expect(result.data.questions[1]!.presentation).toBeUndefined();
      expect(result.data.questions[1]!.timeLimitSec).toBe(15);
    }
  });
});

describe("toTransfer", () => {
  it("round-trips through parseQuizTransfer", () => {
    const parsed = parseQuizTransfer(validFile(), MAX);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const exported = toTransfer({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      theme: parsed.data.theme,
      settings: parsed.data.settings,
      questions: parsed.data.questions.map((q) => ({
        prompt: q.prompt,
        payload: q.payload,
        presentation: q.presentation ?? DEFAULT_PRESENTATION,
        timeLimitSec: q.timeLimitSec,
        points: q.points,
        explanation: q.explanation ?? null,
      })),
    });

    const reparsed = parseQuizTransfer(exported, MAX);
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) {
      expect(reparsed.data.questions).toHaveLength(2);
      expect(reparsed.data.format).toBe(QUIZ_TRANSFER_FORMAT);
    }
  });
});

describe("transferFilename", () => {
  it("slugs the title", () => {
    expect(transferFilename("Friday Pub Quiz!")).toBe("friday-pub-quiz.quizzly.json");
  });

  it("falls back when nothing survives slugging", () => {
    expect(transferFilename("!!!")).toBe("quiz.quizzly.json");
  });
});
