# Quizzly app-chrome design

This document is the source of truth for the **app chrome** — the dashboard,
editor, forms, settings, and every other screen that is a *tool* rather than a
*show*. The quiz surface (lobby, questions, reveal, podium) is a separate,
user-themed colour system driven by `--q-*` variables and is deliberately not
covered here; see the two-systems note in `src/app/globals.css`.

## Direction

The chrome used to be near-black (`#0b0c18`). That look flatters the neon quiz
themes, but the chrome isn't the show — it's the workbench. Teachers prepping a
quiz at 3pm in a bright classroom, on a projector, or on a cheap laptop panel
are better served by a **light, calm, friendly** surface:

- Light chrome makes the *quiz preview* pop instead of competing with it. A
  neon-on-black theme reads as an object sitting on the workbench, which is
  exactly the mental model we want in the editor.
- Dark text on light ground is more forgiving of bad projectors, cheap panels,
  sunlight, and low-vision users than light-on-dark at these type sizes.
- "Friendly" comes from warmth and roundness we already have (rounded cards,
  soft shadows, the indigo brand), not from adding decoration.

The palette stays *cool neutral* (the existing `ink` scale has a subtle indigo
cast) so the brand indigo feels native, and every neutral is shared between the
old and new chrome — this was a re-mapping, not a re-invention.

## Palette tokens

Defined in `@theme` in `src/app/globals.css`. The `ink` scale is a cool
neutral ramp, 50 → 950 light → dark. The chrome uses it as follows:

| Role | Token | Value | Contrast on its ground |
|---|---|---|---|
| Page background | `ink-50` | `#f6f7fb` | — |
| Card / input background | white | `#ffffff` | — |
| Hairline borders | `ink-200` | `#d9dced` | non-text |
| Input borders, ghost-button borders | `ink-300` | `#b4bad4` | non-text |
| Hover surface | `ink-100` | `#eceef6` | — |
| Muted text (hints, counts, timestamps) | `ink-500` | `#5d6490` | 5.7:1 on white |
| Secondary text (body copy, descriptions) | `ink-600` | `#454a73` | 8.2:1 on white |
| Primary text, labels | `ink-700` | `#343858` | 10.6:1 on white |
| Headings, emphasis | `ink-900` | `#14152a` | 17.6:1 on white |
| Brand action / links | `brand-600` | `#4f46e5` | 6.3:1 on white |
| Brand hover | `brand-700` | `#4338ca` | 8.0:1 on white |
| Brand tint (badges, selected states) | `brand-100` on text `brand-700` | `#e0e7ff` | 7.2:1 |
| Danger text | `red-600`/`red-700` on `red-50` | Tailwind | ≥4.5:1 |
| Success text | `emerald-700`/`emerald-800` on `emerald-50` | Tailwind | ≥4.5:1 |

Rules of thumb:

- **`ink-400` and lighter are never text colours** on light ground — they fail
  AA. They exist for borders and decorative strokes only. Placeholder text uses
  `ink-500` via `.app-input::placeholder`.
- Text on a coloured tint (red-50, emerald-50, brand-100) uses the 700/800 step
  of the same hue — that keeps every message ≥4.5:1 without per-case checking.
- Focus rings are `brand-600` (was `brand-400`): 3.9:1 against white, above
  the 3:1 non-text minimum, and visible on both the page and card grounds.

## Type scale

Unchanged in structure — the sweep only re-coloured it. System font stack
(`--font-sans`), with a deliberate ceiling: the chrome never needs display
type, that's the quiz surface's job.

| Step | Usage |
|---|---|
| `text-2xl font-bold` | Page title (one per page) |
| `font-semibold` (base size) | Card/section headings |
| base | Body copy |
| `text-sm` | Secondary copy, buttons, table-ish rows |
| `text-xs` | Hints under inputs, timestamps, badges |
| `text-[10px] uppercase tracking-wide` | Tiny status chips only |

## Spacing & shape

- Layout containers: `max-w-5xl`/`max-w-6xl` with `px-5`; vertical rhythm
  `py-8` for main, `py-4` for headers.
- Cards: `.app-card` — 0.875rem radius, 1px `ink-200` border, white ground,
  a barely-there shadow (`0 1px 2px` at 5%) for lift without weight.
- Inputs: `.app-input` — 0.5rem radius, comfortable 0.6rem/0.8rem padding.
- Touch targets: interactive controls keep their existing ≥44px hit areas on
  touch-first screens (player-facing surfaces) and never shrink below what
  they were in the dark chrome. Checkboxes stay `h-5 w-5` with generous label
  hit areas (the whole `<label>` is clickable).

## Accessibility invariants

These were true before the redesign and must stay true:

- Visible `:focus-visible` outline everywhere, 2px + 2px offset.
- All text ≥4.5:1 (AA); all UI strokes that carry meaning ≥3:1.
- `prefers-reduced-motion` collapses all animation.
- Error/success feedback is coloured *and* worded — colour is never the only
  channel — and uses `role="alert"` / `role="status"`.

## What this pass deliberately did not touch

- Anything inside `.quiz-surface` or driven by `--q-*` variables. All ten
  built-in themes render byte-for-byte the same CSS variables as before.
- The theme-preview panels inside the editor: they render the *quiz's* look
  and must keep doing so, whatever the chrome around them looks like.
- Layout, information architecture, and copy. One change at a time.
