"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import {
  QUESTION_TYPES,
  type QuestionPayload,
  type QuestionTypeName,
} from "@/lib/question-schema";
import type { Presentation, Theme } from "@/lib/theme";
import type { QuizSettings } from "@/lib/scoring";
import type { AiAvailability } from "@/lib/ai/provider";
import {
  addQuestionAction,
  deleteQuestionAction,
  reorderQuestionAction,
  saveQuestionAction,
} from "@/app/actions/quiz";
import { QuestionEditor, type DraftQuestion } from "./QuestionEditor";
import { ThemeEditor } from "./ThemeEditor";
import { SettingsEditor } from "./SettingsEditor";
import { AiPanel } from "./AiPanel";
import {
  autosaveLabel,
  useUnsavedChangesWarning,
  type AutosaveStatus,
} from "./useAutosave";

export interface EditorQuestion {
  id: string;
  prompt: string;
  payload: QuestionPayload;
  presentation: Presentation;
  timeLimitSec: number;
  points: number;
  explanation: string | null;
}

export type QuizVisibilityName = "PRIVATE" | "UNLISTED" | "PUBLIC";

type Tab = "questions" | "design" | "settings" | "ai";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "questions", label: "Questions" },
  { id: "design", label: "Design" },
  { id: "settings", label: "Game rules" },
  { id: "ai", label: "AI draft" },
];

const AUTOSAVE_DELAY_MS = 1000;

/** The part of a question the save action persists, as a comparable string. */
function snapshot(q: EditorQuestion): string {
  return JSON.stringify([
    q.prompt,
    q.payload,
    q.presentation,
    q.timeLimitSec,
    q.points,
    q.explanation,
  ]);
}

export function EditorClient({
  quizId,
  title,
  initialQuestions,
  initialTheme,
  initialSettings,
  initialVisibility,
  initialCoverImage,
  mode,
  ai,
}: {
  quizId: string;
  title: string;
  description: string | null;
  initialQuestions: EditorQuestion[];
  initialTheme: Theme;
  initialSettings: QuizSettings;
  initialVisibility: QuizVisibilityName;
  initialCoverImage: string | null;
  mode: "SOLO" | "COLLAB";
  ai: AiAvailability;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("questions");
  const [questions, setQuestions] = useState(initialQuestions);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialQuestions[0]?.id ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<AutosaveStatus>("saved");
  const [pending, startTransition] = useTransition();
  const [showTypePicker, setShowTypePicker] = useState(false);

  // Autosave bookkeeping. `savedRef` holds the last server-acknowledged
  // snapshot per question; `questionsRef` lets the debounce timer read current
  // state without stale closures.
  const savedRef = useRef<Map<string, string>>(
    new Map(initialQuestions.map((q) => [q.id, snapshot(q)])),
  );
  const questionsRef = useRef(questions);
  questionsRef.current = questions;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);

  const selected = questions.find((q) => q.id === selectedId) ?? null;

  // `router.refresh()` (after add/reorder/AI-draft) re-renders the server page
  // and hands this component fresh props, but React keeps the existing state.
  // Reconcile: take the server's list and order, except that a question with
  // edits the server hasn't acknowledged yet keeps its local version.
  useEffect(() => {
    setQuestions((prev) =>
      initialQuestions.map((incoming) => {
        const local = prev.find((p) => p.id === incoming.id);
        if (local && snapshot(local) !== savedRef.current.get(incoming.id)) {
          return local;
        }
        savedRef.current.set(incoming.id, snapshot(incoming));
        return incoming;
      }),
    );
  }, [initialQuestions]);

  const persist = useCallback(
    async (questionId: string) => {
      const question = questionsRef.current.find((q) => q.id === questionId);
      if (!question) return;

      const snap = snapshot(question);
      if (snap === savedRef.current.get(questionId)) {
        setSaveStatus("saved");
        return;
      }

      // An empty prompt can't pass validation. Don't spam the server (or the
      // author) about a question they're mid-way through writing; the status
      // line keeps showing unsaved until there is something to save.
      if (!question.prompt.trim()) return;

      if (inFlightRef.current) {
        // A save is already running; try again once it has had time to land.
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => void persist(questionId), 400);
        return;
      }

      inFlightRef.current = true;
      setSaveStatus("saving");
      const result = await saveQuestionAction({
        questionId: question.id,
        prompt: question.prompt,
        payload: question.payload,
        presentation: question.presentation,
        timeLimitSec: question.timeLimitSec,
        points: question.points,
        explanation: question.explanation,
      });
      inFlightRef.current = false;

      if (result.error) {
        setSaveStatus("error");
        setError(result.error);
        return;
      }

      savedRef.current.set(questionId, snap);
      setError(null);

      // More edits may have arrived while the request was in flight.
      const latest = questionsRef.current.find((q) => q.id === questionId);
      if (latest && snapshot(latest) !== snap) {
        setSaveStatus("pending");
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(
          () => void persist(questionId),
          AUTOSAVE_DELAY_MS,
        );
      } else {
        setSaveStatus("saved");
      }
    },
    [],
  );

  const scheduleAutosave = useCallback(
    (questionId: string) => {
      setSaveStatus("pending");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(
        () => void persist(questionId),
        AUTOSAVE_DELAY_MS,
      );
    },
    [persist],
  );

  /** Save now — used when leaving a question and by the explicit button. */
  const flush = useCallback(
    (questionId: string | null) => {
      if (!questionId) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      void persist(questionId);
    },
    [persist],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useUnsavedChangesWarning(saveStatus === "pending" || saveStatus === "saving");

  function updateSelected(next: DraftQuestion) {
    if (!selectedId) return;
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === selectedId
          ? {
              ...q,
              prompt: next.prompt,
              payload: next.payload,
              presentation: next.presentation,
              timeLimitSec: next.timeLimitSec,
              points: next.points,
              explanation: next.explanation,
            }
          : q,
      ),
    );
    scheduleAutosave(selectedId);
  }

  function save() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      // The explicit button also surfaces validation errors autosave keeps
      // quiet about (an empty prompt), so nobody wonders why nothing saved.
      if (!selected.prompt.trim()) {
        setError("Write the question.");
        return;
      }
      await persist(selected.id);
    });
  }

  function selectQuestion(questionId: string) {
    flush(selectedId);
    setSelectedId(questionId);
    setError(null);
  }

  function addQuestion(type: QuestionTypeName) {
    setShowTypePicker(false);
    setError(null);
    flush(selectedId);

    startTransition(async () => {
      const result = await addQuestionAction(quizId, type);
      if (result.error) {
        setError(result.error);
        return;
      }
      // The server is the source of truth for the new row, so refresh rather
      // than guessing what it created.
      router.refresh();
      if (result.questionId) setSelectedId(result.questionId);
    });
  }

  function remove(questionId: string) {
    startTransition(async () => {
      const result = await deleteQuestionAction(questionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      savedRef.current.delete(questionId);
      setQuestions((prev) => prev.filter((q) => q.id !== questionId));
      if (selectedId === questionId) setSelectedId(null);
      router.refresh();
    });
  }

  function reorder(questionId: string, direction: "up" | "down") {
    startTransition(async () => {
      await reorderQuestionAction(questionId, direction);
      router.refresh();
    });
  }

  return (
    <div>
      {/* ── Tabs ── */}
      <div className="mb-6 flex items-center border-b border-ink-200">
        <div role="tablist" className="flex flex-1 gap-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => {
                if (tab === "questions") flush(selectedId);
                setTab(item.id);
              }}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === item.id
                  ? "border-brand-500 text-ink-900"
                  : "border-transparent text-ink-600 hover:text-ink-900"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {tab === "questions" && questions.length > 0 ? (
          <span
            role="status"
            className={`hidden pb-1 text-xs sm:inline ${
              saveStatus === "error" ? "text-red-600" : "text-ink-500"
            }`}
          >
            {autosaveLabel(saveStatus)}
          </span>
        ) : null}
      </div>

      {tab === "questions" ? (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* ── Question list ── */}
          <aside>
            <ol className="space-y-2">
              {questions.map((question, index) => (
                <li key={question.id} className="flex items-stretch gap-1">
                  <button
                    type="button"
                    onClick={() => selectQuestion(question.id)}
                    aria-current={selectedId === question.id}
                    className={`app-card min-w-0 flex-1 px-3 py-2.5 text-left ${
                      selectedId === question.id
                        ? "border-brand-600"
                        : "hover:border-ink-400"
                    }`}
                  >
                    <span className="block truncate text-sm font-medium text-ink-900">
                      {index + 1}. {question.prompt || "Untitled question"}
                    </span>
                    <span className="text-xs text-ink-500">
                      {question.payload.type.replace(/_/g, " ").toLowerCase()}
                    </span>
                  </button>

                  <span className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => reorder(question.id, "up")}
                      disabled={index === 0 || pending}
                      aria-label={`Move question ${index + 1} up`}
                      className="btn btn-ghost flex-1 px-2 py-0 text-xs"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => reorder(question.id, "down")}
                      disabled={index === questions.length - 1 || pending}
                      aria-label={`Move question ${index + 1} down`}
                      className="btn btn-ghost flex-1 px-2 py-0 text-xs"
                    >
                      ↓
                    </button>
                  </span>
                </li>
              ))}
            </ol>

            <div className="mt-3">
              {showTypePicker ? (
                <div className="app-card p-2">
                  <p className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
                    Pick a type
                  </p>
                  <ul className="max-h-80 overflow-y-auto">
                    {QUESTION_TYPES.map((type) => (
                      <li key={type.id}>
                        <button
                          type="button"
                          onClick={() => addQuestion(type.id)}
                          className="flex w-full items-start gap-2 rounded px-2 py-2 text-left hover:bg-ink-100"
                        >
                          <span aria-hidden className="text-brand-600">
                            {type.icon}
                          </span>
                          <span>
                            <span className="block text-sm font-medium text-ink-900">
                              {type.label}
                            </span>
                            <span className="block text-xs text-ink-500">
                              {type.blurb}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setShowTypePicker(false)}
                    className="btn btn-ghost mt-1 w-full py-1.5 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowTypePicker(true)}
                  disabled={pending}
                  className="btn btn-ghost w-full"
                >
                  + Add question
                </button>
              )}
            </div>
          </aside>

          {/* ── Editor ── */}
          <section className="app-card p-5">
            {selected ? (
              <QuestionEditor
                value={selected}
                onChange={updateSelected}
                onSave={save}
                onDelete={() => remove(selected.id)}
                saving={pending || saveStatus === "saving"}
                error={error}
                message={null}
                saveLabel="Save now"
                uploadQuizId={quizId}
              />
            ) : (
              <p className="py-16 text-center text-ink-600">
                {questions.length === 0
                  ? "Add your first question to get started."
                  : "Pick a question from the list."}
              </p>
            )}
          </section>
        </div>
      ) : null}

      {tab === "design" ? (
        <ThemeEditor quizId={quizId} initialTheme={initialTheme} />
      ) : null}

      {tab === "settings" ? (
        <SettingsEditor
          quizId={quizId}
          initialSettings={initialSettings}
          initialVisibility={initialVisibility}
          initialCoverImage={initialCoverImage}
          mode={mode}
        />
      ) : null}

      {tab === "ai" ? (
        <AiPanel quizId={quizId} availability={ai} quizTitle={title} />
      ) : null}
    </div>
  );
}
