"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { resetPasswordAction, type FormState } from "@/app/actions/auth";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary mt-5 w-full py-2.5" disabled={pending}>
      {pending ? "Just a moment…" : "Set new password"}
    </button>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(
    resetPasswordAction,
    {},
  );

  return (
    <form action={formAction} className="mt-5">
      <input type="hidden" name="token" value={token} />

      <label className="app-label" htmlFor="password">
        New password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        minLength={10}
        autoComplete="new-password"
        className="app-input"
        placeholder="At least 10 characters"
        aria-describedby={state.fieldErrors?.password ? "password-error" : "password-hint"}
      />
      {state.fieldErrors?.password ? (
        <p id="password-error" className="mt-1.5 text-sm text-red-400">
          {state.fieldErrors.password}
        </p>
      ) : (
        <p id="password-hint" className="mt-1.5 text-xs text-ink-500">
          A few random words is stronger and easier to remember than a short
          password full of symbols.
        </p>
      )}

      {state.error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300"
        >
          {state.error}
        </p>
      ) : null}

      <Submit />
    </form>
  );
}
