import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PasswordInput, passwordInputType } from "./PasswordInput";

describe("passwordInputType", () => {
  it("is password when hidden", () => {
    expect(passwordInputType(false)).toBe("password");
  });

  it("is text when visible", () => {
    expect(passwordInputType(true)).toBe("text");
  });
});

describe("PasswordInput", () => {
  it("starts hidden: type=password, aria-pressed=false, and a 'toon' label", () => {
    const html = renderToStaticMarkup(
      <PasswordInput name="password" autoComplete="current-password" />,
    );

    expect(html).toContain('type="password"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="Toon wachtwoord"');
  });

  it("keeps the autoComplete attribute regardless of the input type", () => {
    const html = renderToStaticMarkup(
      <PasswordInput name="password" autoComplete="new-password" />,
    );

    expect(html).toContain('autoComplete="new-password"');
  });

  it("is a real <button type=button>, so it is keyboard operable (Enter/Space) without extra wiring", () => {
    const html = renderToStaticMarkup(
      <PasswordInput name="password" autoComplete="current-password" />,
    );

    expect(html).toContain('<button type="button"');
  });

  it("supports custom toggle labels", () => {
    const html = renderToStaticMarkup(
      <PasswordInput
        name="password"
        autoComplete="current-password"
        toggleLabels={{ show: "Show password", hide: "Hide password" }}
      />,
    );

    expect(html).toContain('aria-label="Show password"');
  });
});
