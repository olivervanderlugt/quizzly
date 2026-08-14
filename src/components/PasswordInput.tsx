"use client";

import { useId, useState, type InputHTMLAttributes } from "react";

/**
 * Pure so it is testable without rendering: given whether the password is
 * currently shown, which `type` the underlying `<input>` should carry. Kept
 * separate from the component so a test can pin the two states down without
 * needing jsdom or a click simulation.
 */
export function passwordInputType(visible: boolean): "text" | "password" {
  return visible ? "text" : "password";
}

type ToggleLabels = {
  /** Announced by the button when the password is currently hidden (pressing it reveals it). */
  show: string;
  /** Announced by the button when the password is currently shown (pressing it hides it). */
  hide: string;
};

const DEFAULT_LABELS: ToggleLabels = {
  show: "Toon wachtwoord",
  hide: "Verberg wachtwoord",
};

export type PasswordInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  /**
   * Labels for the toggle button, read by screen readers via `aria-label`.
   * Defaults to Dutch, matching the surrounding auth forms.
   */
  toggleLabels?: ToggleLabels;
};

/**
 * A password `<input>` with an accessible show/hide toggle. Starts hidden.
 * `autoComplete` (and every other input prop) passes straight through to the
 * underlying `<input>` regardless of which `type` it currently has — toggling
 * visibility only ever touches `type`, so a password manager's autofill
 * attributes survive the switch.
 */
export function PasswordInput({
  toggleLabels = DEFAULT_LABELS,
  className,
  id,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="relative">
      <input
        {...props}
        id={inputId}
        type={passwordInputType(visible)}
        className={`${className ?? "app-input"} pr-10`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-label={visible ? toggleLabels.hide : toggleLabels.show}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-500 hover:text-ink-200"
      >
        {visible ? (
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-6.06M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a20.3 20.3 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
