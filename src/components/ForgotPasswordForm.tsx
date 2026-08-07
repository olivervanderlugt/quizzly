"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  requestPasswordResetAction,
  type FormState,
} from "@/app/actions/auth";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary mt-5 w-full py-2.5" disabled={pending}>
      {pending ? "Just a moment…" : "Send reset link"}
    </button>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<FormState, FormData>(
    requestPasswordResetAction,
    {},
  );

  // Once the neutral confirmation is up, the form has done its job — leaving
  // it interactive would only invite retries that hit the rate limit.
  if (state.message) {
    return (
      <p
        role="status"
        className="mt-5 rounded-lg border border-emerald-900 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300"
      >
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-5">
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
      />

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
