"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  loginAction,
  signupAction,
  type FormState,
} from "@/app/actions/auth";

function SubmitButton({ label }: { label: string }) {
  // `useFormStatus` must be called from a component *inside* the form, which is
  // why this is split out rather than inlined.
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="btn btn-primary mt-5 w-full py-2.5" disabled={pending}>
      {pending ? "Just a moment…" : label}
    </button>
  );
}

export function AuthForm({
  mode,
  next,
}: {
  mode: "login" | "signup";
  next?: string;
}) {
  const action = mode === "login" ? loginAction : signupAction;
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="mt-5">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {mode === "signup" ? (
        <div className="mb-4">
          <label className="app-label" htmlFor="displayName">
            Your name
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            required
            maxLength={40}
            autoComplete="name"
            className="app-input"
            placeholder="Alex Rivera"
            aria-describedby={state.fieldErrors?.displayName ? "displayName-error" : undefined}
          />
          {state.fieldErrors?.displayName ? (
            <p id="displayName-error" className="mt-1.5 text-sm text-red-400">
              {state.fieldErrors.displayName}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mb-4">
        <label className="app-label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="app-input"
          placeholder="you@example.com"
          aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
        />
        {state.fieldErrors?.email ? (
          <p id="email-error" className="mt-1.5 text-sm text-red-400">
            {state.fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div>
        <label className="app-label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={mode === "signup" ? 10 : undefined}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          className="app-input"
          placeholder={mode === "signup" ? "At least 10 characters" : "Your password"}
          aria-describedby={
            state.fieldErrors?.password
              ? "password-error"
              : mode === "signup"
                ? "password-hint"
                : undefined
          }
        />
        {mode === "signup" && !state.fieldErrors?.password ? (
          <p id="password-hint" className="mt-1.5 text-xs text-ink-500">
            A few random words is stronger and easier to remember than a short
            password full of symbols.
          </p>
        ) : null}
        {state.fieldErrors?.password ? (
          <p id="password-error" className="mt-1.5 text-sm text-red-400">
            {state.fieldErrors.password}
          </p>
        ) : null}
      </div>

      {mode === "signup" ? (
        <div className="mt-4">
          <label className="flex items-start gap-2.5 text-sm text-ink-300">
            <input
              type="checkbox"
              name="ageConfirm"
              required
              className="mt-0.5 accent-brand-400"
              aria-describedby={state.fieldErrors?.ageConfirm ? "ageConfirm-error" : undefined}
            />
            <span>
              I&apos;m at least 16, or the digital age of consent where I live.
            </span>
          </label>
          {state.fieldErrors?.ageConfirm ? (
            <p id="ageConfirm-error" className="mt-1.5 text-sm text-red-400">
              {state.fieldErrors.ageConfirm}
            </p>
          ) : null}
        </div>
      ) : null}

      {state.error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300"
        >
          {state.error}
        </p>
      ) : null}

      <SubmitButton label={mode === "login" ? "Sign in" : "Create account"} />

      {mode === "signup" ? (
        <p className="mt-3 text-center text-xs text-ink-500">
          By creating an account you agree to the{" "}
          <Link href="/terms" className="underline hover:text-ink-300">
            terms
          </Link>{" "}
          and the{" "}
          <Link href="/privacy" className="underline hover:text-ink-300">
            privacy policy
          </Link>
          .
        </p>
      ) : null}
    </form>
  );
}
