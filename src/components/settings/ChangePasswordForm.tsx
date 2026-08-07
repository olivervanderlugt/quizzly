"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { changePasswordAction } from "@/app/actions/settings";
import type { ActionState } from "@/app/actions/quiz";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary mt-3" disabled={pending}>
      {pending ? "Changing…" : "Change password"}
    </button>
  );
}

export function ChangePasswordForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(
    changePasswordAction,
    {},
  );

  return (
    <form action={formAction} className="mt-4">
      <label className="app-label" htmlFor="currentPassword">
        Current password
      </label>
      <input
        id="currentPassword"
        name="currentPassword"
        type="password"
        required
        autoComplete="current-password"
        className="app-input"
      />

      <label className="app-label mt-3 block" htmlFor="newPassword">
        New password
      </label>
      <input
        id="newPassword"
        name="newPassword"
        type="password"
        required
        minLength={10}
        autoComplete="new-password"
        className="app-input"
        placeholder="At least 10 characters"
      />

      {state.error ? (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="mt-2 text-sm text-emerald-400">
          {state.message}
        </p>
      ) : null}

      <Submit />
    </form>
  );
}
