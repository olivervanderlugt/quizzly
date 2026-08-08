"use client";

import { themeToCssVars, type Theme } from "@/lib/theme";
import type { QuestionPayload } from "@/lib/question-schema";
import type { DraftQuestion } from "./QuestionEditor";

/**
 * The live slide preview: the question being edited, rendered through the
 * quiz's real theme variables and its chosen layout, updating as you type.
 *
 * This mirrors the layout composition of `QuestionFrame`
 * (src/components/play/QuestionFrame.tsx) rather than mounting it — the live
 * component is entangled with sockets and server timers. If you change how a
 * layout composes there, change it here too; docs/SLIDE-DESIGNER.md explains
 * why the duplication is the current trade.
 *
 * It renders inside `.quiz-surface`, so everything here draws from `--q-*`
 * variables and none of it is affected by the app chrome.
 */
export function SlidePreview({
  theme,
  question,
  index,
  total,
}: {
  theme: Theme;
  question: DraftQuestion;
  index: number;
  total: number;
}) {
  const { presentation } = question;
  const accent = presentation.accentOverride;

  const prompt = (
    <p
      className="quiz-display text-balance text-lg font-extrabold leading-tight"
      style={accent ? { color: accent } : undefined}
    >
      {question.prompt || "Your question appears here"}
    </p>
  );

  const media = presentation.media ? (
    // Alt is authored in the editor next to this preview; here it's decor.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={presentation.media}
      alt=""
      className="max-h-40 w-full rounded-lg object-cover"
    />
  ) : null;

  const header = (
    <div className="mb-3 flex items-center justify-between text-xs opacity-70">
      <span>
        Question {index + 1}
        <span className="opacity-60"> of {total}</span>
      </span>
      <span className="numeric">{question.points} pts</span>
    </div>
  );

  const timer = presentation.hideTimer ? null : (
    <div>
      <div
        className="h-2 w-full overflow-hidden rounded-full"
        style={{ background: "color-mix(in srgb, var(--q-text) 15%, transparent)" }}
      >
        <div
          className="h-full w-2/3 rounded-full"
          style={{ background: "var(--q-accent)" }}
        />
      </div>
      <p className="numeric mt-1 text-right text-xs font-semibold opacity-80">
        {question.timeLimitSec}s
      </p>
    </div>
  );

  const answers = <AnswerMock payload={question.payload} />;

  return (
    <div>
      <p className="app-label">Slide preview</p>
      <div
        className="quiz-surface overflow-hidden rounded-xl border border-ink-200 p-4"
        style={{ ...themeToCssVars(theme), minHeight: "auto" }}
      >
        {presentation.layout === "banner" ? (
          <>
            {header}
            <div className="relative mb-3 overflow-hidden rounded-xl">
              {media ?? <MissingImage />}
              <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/85 via-black/35 to-transparent p-3">
                <p className="quiz-display text-balance text-lg font-extrabold leading-tight text-white">
                  {question.prompt || "Your question appears here"}
                </p>
              </div>
            </div>
            {timer}
            <div className="mt-3">{answers}</div>
          </>
        ) : presentation.layout === "mediaSplit" ? (
          <>
            {header}
            <div className="grid grid-cols-2 items-center gap-3">
              <div className="overflow-hidden rounded-lg">{media ?? <MissingImage />}</div>
              <div>{prompt}</div>
            </div>
            <div className="mt-3">{timer}</div>
            <div className="mt-3">{answers}</div>
          </>
        ) : presentation.layout === "mediaTop" ? (
          <>
            {header}
            {prompt}
            <div className="mt-3 overflow-hidden rounded-lg">{media ?? <MissingImage />}</div>
            <div className="mt-3">{timer}</div>
            <div className="mt-3">{answers}</div>
          </>
        ) : presentation.layout === "spotlight" ? (
          <>
            {header}
            <div className="quiz-card mb-3 px-4 py-6 text-center">
              <p
                className="quiz-display text-balance text-xl font-extrabold leading-tight"
                style={accent ? { color: accent } : undefined}
              >
                {question.prompt || "Your question appears here"}
              </p>
            </div>
            {timer}
            <div className="mt-3">{answers}</div>
          </>
        ) : presentation.layout === "minimal" ? (
          <>
            {prompt}
            <div className="mt-3">{timer}</div>
            <div className="mt-4">{answers}</div>
          </>
        ) : (
          <>
            {header}
            <div className="quiz-card mb-3 px-4 py-4">{prompt}</div>
            {timer}
            <div className="mt-3">{answers}</div>
          </>
        )}
      </div>
      <p className="mt-1.5 text-xs text-ink-500">
        How this slide looks on the shared screen, in the quiz&apos;s theme.
      </p>
    </div>
  );
}

function MissingImage() {
  return (
    <div
      className="flex h-24 w-full items-center justify-center rounded-lg text-xs opacity-60"
      style={{ background: "color-mix(in srgb, var(--q-text) 10%, transparent)" }}
    >
      Add an image for this layout
    </div>
  );
}

/** Static, non-interactive stand-ins for the player's answer controls. */
function AnswerMock({ payload }: { payload: QuestionPayload }) {
  switch (payload.type) {
    case "MULTIPLE_CHOICE":
    case "MULTIPLE_SELECT":
    case "POLL":
      return (
        <div className="grid grid-cols-2 gap-1.5">
          {payload.options.map((option, i) => (
            <div
              key={option.id}
              className="answer-tile px-2.5 py-3 text-xs font-semibold text-white"
              style={{ background: `var(--q-answer-${(i % 4) + 1})` }}
            >
              {option.text || `Option ${i + 1}`}
            </div>
          ))}
        </div>
      );

    case "TRUE_FALSE":
      return (
        <div className="grid grid-cols-2 gap-1.5">
          {["True", "False"].map((label, i) => (
            <div
              key={label}
              className="answer-tile px-2.5 py-3 text-center text-xs font-semibold text-white"
              style={{ background: `var(--q-answer-${i === 0 ? 4 : 1})` }}
            >
              {label}
            </div>
          ))}
        </div>
      );

    case "TYPE_ANSWER":
    case "WORD_CLOUD":
      return (
        <MockField
          hint={payload.type === "WORD_CLOUD" ? "Players type words…" : "Players type their answer…"}
        />
      );

    case "NUMERIC":
      return <MockField hint={`Players type a number${payload.unit ? ` (${payload.unit})` : ""}…`} />;

    case "SLIDER":
      return (
        <div className="py-1.5">
          <div
            className="relative h-2 w-full rounded-full"
            style={{ background: "color-mix(in srgb, var(--q-text) 20%, transparent)" }}
          >
            <div
              className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ background: "var(--q-accent)" }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] opacity-70">
            <span className="numeric">{payload.min}</span>
            <span className="numeric">{payload.max}</span>
          </div>
        </div>
      );

    case "ORDERING":
      return (
        <ol className="space-y-1.5">
          {payload.items.map((item, i) => (
            <li
              key={item.id}
              className="answer-tile flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-white"
              style={{ background: `var(--q-answer-${(i % 4) + 1})` }}
            >
              <span className="numeric opacity-70">{i + 1}</span>
              {item.text || `Item ${i + 1}`}
            </li>
          ))}
        </ol>
      );

    case "MATCHING":
      return (
        <div className="grid grid-cols-2 gap-1.5">
          {payload.pairs.map((pair, i) => (
            <div key={pair.id} className="contents">
              <div
                className="answer-tile px-2.5 py-2 text-xs font-semibold text-white"
                style={{ background: `var(--q-answer-${(i % 4) + 1})` }}
              >
                {pair.left || `Left ${i + 1}`}
              </div>
              <div className="quiz-card px-2.5 py-2 text-xs font-semibold">
                {pair.right || `Right ${i + 1}`}
              </div>
            </div>
          ))}
        </div>
      );
  }
}

function MockField({ hint }: { hint: string }) {
  return (
    <div
      className="rounded-lg px-3 py-2.5 text-xs opacity-80"
      style={{
        background: "color-mix(in srgb, var(--q-surface) 82%, transparent)",
        border: "1px solid color-mix(in srgb, var(--q-text) 20%, transparent)",
      }}
    >
      {hint}
    </div>
  );
}
