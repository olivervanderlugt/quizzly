"use client";

import { useCallback, useState, useTransition } from "react";

import type { QuizSettings } from "@/lib/scoring";
import {
  setCoverImageAction,
  updateSettingsAction,
  updateVisibilityAction,
} from "@/app/actions/quiz";
import { ImageUpload, UploadHint } from "./ImageUpload";
import type { QuizVisibilityName } from "./EditorClient";
import { autosaveLabel, useAutosave, useUnsavedChangesWarning } from "./useAutosave";

export function SettingsEditor({
  quizId,
  initialSettings,
  initialVisibility,
  initialCoverImage,
  mode,
}: {
  quizId: string;
  initialSettings: QuizSettings;
  initialVisibility: QuizVisibilityName;
  initialCoverImage: string | null;
  mode: "SOLO" | "COLLAB";
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [visibility, setVisibility] = useState(initialVisibility);
  const [visibilityError, setVisibilityError] = useState<string | null>(null);
  const [visibilityPending, startVisibility] = useTransition();
  const [coverImage, setCoverImage] = useState(initialCoverImage);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [coverPending, startCover] = useTransition();

  function saveCover(next: string) {
    const previous = coverImage;
    setCoverImage(next || null);
    setCoverError(null);
    startCover(async () => {
      const result = await setCoverImageAction(quizId, next);
      if (result.error) {
        setCoverImage(previous);
        setCoverError(result.error);
      }
    });
  }

  const saveSettings = useCallback(
    (value: QuizSettings) => updateSettingsAction(quizId, value),
    [quizId],
  );
  const { status, error } = useAutosave(settings, saveSettings);
  useUnsavedChangesWarning(status === "pending" || status === "saving");

  const patch = (partial: Partial<QuizSettings>) =>
    setSettings((prev) => ({ ...prev, ...partial }));

  const patchScoring = (partial: Partial<QuizSettings["scoring"]>) =>
    setSettings((prev) => ({ ...prev, scoring: { ...prev.scoring, ...partial } }));

  function setPublic(isPublic: boolean) {
    const next = isPublic ? "PUBLIC" : "PRIVATE";
    const previous = visibility;
    setVisibility(next);
    setVisibilityError(null);
    startVisibility(async () => {
      const result = await updateVisibilityAction(quizId, next);
      if (result.error) {
        setVisibility(previous);
        setVisibilityError(result.error);
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <section className="app-card p-5">
        <h2 className="font-semibold text-white">Cover image</h2>
        <p className="mt-1 text-sm text-ink-400">
          Shown on your dashboard so a quiz is recognisable at a glance.
        </p>

        <div className="mt-4 flex flex-wrap items-start gap-4">
          {coverImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverImage}
              alt=""
              className="h-24 w-40 rounded-lg border border-ink-800 object-cover"
            />
          ) : (
            <div className="flex h-24 w-40 items-center justify-center rounded-lg border border-dashed border-ink-800 text-xs text-ink-500">
              No cover yet
            </div>
          )}

          <div>
            <ImageUpload
              quizId={quizId}
              label={coverImage ? "Replace cover" : "Upload a cover"}
              onUploaded={saveCover}
              disabled={coverPending}
            />
            {coverImage ? (
              <button
                type="button"
                className="btn btn-ghost mt-2 text-sm"
                disabled={coverPending}
                onClick={() => saveCover("")}
              >
                Remove cover
              </button>
            ) : null}
            <UploadHint />
            {coverPending ? <p className="text-xs text-ink-500">Saving…</p> : null}
            {coverError ? (
              <p role="alert" className="mt-1 text-sm text-red-400">
                {coverError}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="app-card p-5">
        <h2 className="font-semibold text-white">Sharing</h2>

        {mode === "COLLAB" ? (
          <p className="mt-3 text-sm text-ink-400">
            Group quizzes stay private. Contributors were promised nobody could
            read their questions before the game — a public listing would break
            that promise.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <Check
              label="List this quiz publicly"
              hint="Anyone with an account can find it on the Discover page, host it, or save a copy — which includes seeing the answers."
              checked={visibility === "PUBLIC"}
              onChange={setPublic}
            />
            {visibilityPending ? (
              <p className="text-xs text-ink-500">Updating…</p>
            ) : null}
            {visibilityError ? (
              <p role="alert" className="text-sm text-red-400">
                {visibilityError}
              </p>
            ) : null}
          </div>
        )}
      </section>

      <section className="app-card p-5">
        <h2 className="font-semibold text-white">Scoring</h2>

        <div className="mt-4 space-y-4">
          <Check
            label="Reward faster answers"
            hint="Points scale down the longer someone takes."
            checked={settings.scoring.speedBonus}
            onChange={(speedBonus) => patchScoring({ speedBonus })}
          />

          {settings.scoring.speedBonus ? (
            <div>
              <label className="app-label" htmlFor="floor">
                Slowest correct answer earns{" "}
                {Math.round(settings.scoring.slowestAnswerFraction * 100)}%
              </label>
              <input
                id="floor"
                type="range"
                min={0}
                max={100}
                step={5}
                value={settings.scoring.slowestAnswerFraction * 100}
                onChange={(e) =>
                  patchScoring({ slowestAnswerFraction: Number(e.target.value) / 100 })
                }
                className="w-full"
              />
              <p className="mt-1 text-xs text-ink-500">
                Keep this above zero — if the last seconds are worth nothing,
                players stop trying once they&apos;ve hesitated.
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="app-label" htmlFor="streak">
                Streak bonus per question
              </label>
              <input
                id="streak"
                type="number"
                min={0}
                max={1000}
                step={25}
                value={settings.scoring.streakBonus}
                onChange={(e) =>
                  patchScoring({ streakBonus: Number(e.target.value) })
                }
                className="app-input"
              />
            </div>
            <div>
              <label className="app-label" htmlFor="streak-cap">
                Streak stops growing at
              </label>
              <input
                id="streak-cap"
                type="number"
                min={0}
                max={20}
                value={settings.scoring.streakCap}
                onChange={(e) => patchScoring({ streakCap: Number(e.target.value) })}
                className="app-input"
              />
              <p className="mt-1 text-xs text-ink-500">
                Stops an early leader running away with it.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="app-card p-5">
        <h2 className="font-semibold text-white">Flow</h2>

        <div className="mt-4 space-y-4">
          <Check
            label="Shuffle question order"
            hint="Group quizzes always shuffle, regardless of this setting."
            checked={settings.shuffleQuestions}
            onChange={(shuffleQuestions) => patch({ shuffleQuestions })}
          />
          <Check
            label="Shuffle answer options"
            checked={settings.shuffleAnswers}
            onChange={(shuffleAnswers) => patch({ shuffleAnswers })}
          />
          <Check
            label="Show the correct answer after each question"
            checked={settings.showCorrectAnswer}
            onChange={(showCorrectAnswer) => patch({ showCorrectAnswer })}
          />
          <Check
            label="Show the leaderboard between questions"
            checked={settings.showLeaderboard}
            onChange={(showLeaderboard) => patch({ showLeaderboard })}
          />
          <Check
            label="Let players join after the game starts"
            hint="Latecomers start from zero."
            checked={settings.allowLateJoin}
            onChange={(allowLateJoin) => patch({ allowLateJoin })}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="app-label" htmlFor="countdown">
                &quot;Get ready&quot; countdown: {settings.countdownSeconds}s
              </label>
              <input
                id="countdown"
                type="range"
                min={0}
                max={10}
                value={settings.countdownSeconds}
                onChange={(e) =>
                  patch({ countdownSeconds: Number(e.target.value) })
                }
                className="w-full"
              />
            </div>
            <div>
              <label className="app-label" htmlFor="lb-size">
                Players shown on the leaderboard
              </label>
              <input
                id="lb-size"
                type="number"
                min={3}
                max={20}
                value={settings.leaderboardSize}
                onChange={(e) =>
                  patch({ leaderboardSize: Number(e.target.value) })
                }
                className="app-input"
              />
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
      <p
        role="status"
        className={`text-xs ${status === "error" ? "text-red-400" : "text-ink-500"}`}
      >
        {autosaveLabel(status)}
      </p>
    </div>
  );
}

function Check({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-brand-500"
      />
      <span>
        <span className="text-sm font-medium text-ink-200">{label}</span>
        {hint ? <span className="block text-xs text-ink-500">{hint}</span> : null}
      </span>
    </label>
  );
}
