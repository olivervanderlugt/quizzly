# The slide designer

**Vision:** editing a quiz should feel like designing slides. You see the slide
you're building, live, exactly as the room will see it; each question can carry
its own look; and the show has texture — motion, sound, imagery — that today's
build only hints at.

This document maps the whole possibility space, judges each idea against what
the codebase can already carry, and lays out a roadmap of independently
shippable slices. **It deliberately does not decide licensing or privacy
questions** — those are flagged for Ollie.

## What the codebase already carries

Facts the feasibility calls below rest on:

- **`presentationSchema`** (`src/lib/theme.ts`) is the per-question design
  channel: `layout` (6 layouts), `media` + `mediaAlt`, `accentOverride`,
  `hideTimer`. It is validated on save, copied verbatim into
  `Game.quizSnapshot` on start, and delivered to players as
  `PlayerQuestionView.presentation` — whose TypeScript type is *inferred from
  the schema*, so a new presentation field flows editor → DB → snapshot → wire
  → renderer by adding it in exactly one place (plus a renderer branch).
  No DB migration needed: `Question.presentation` is a JSON column.
- **The theme system** carries palette, font pairing, background (6 generative
  kinds), answer shape, and an `animations` flag — per quiz, not per question.
  `themeToCssVars()` turns it into `--q-*` variables at render time.
- **`QuestionFrame`** renders a question by layout on both player and host
  screens. Any new layout or per-slide visual lands there once, for both.
- **Snapshot isolation** means anything added to the quiz row or its questions
  is automatically immutable mid-game. No live-game concerns for design
  features — they are frozen at start like everything else.
- **Uploads** (added this branch): self-hosted images, magic-byte checked,
  EXIF-stripped, 5 MB, served same-origin from a Docker volume. Any "asset"
  feature below can ride this path; audio would need the same treatment with
  audio magic bytes and no EXIF concern.
- **Fixed CSP posture**: no third-party requests from player screens — fonts
  are system stacks *specifically* so nothing is fetched and no consent
  banner is implied. Any feature that calls a third-party API from the client
  breaks that posture and is flagged below.

## Possibility space

Each item: what it is → feasibility against this codebase → verdict.
**Build** = worth building, path is clear. **Schema** = needs a
presentation/settings schema addition (cheap, see above). **Assets** = needs
upload-style infrastructure beyond images. **Decision** = has licensing,
privacy, or cost strings only Ollie can settle.

### Seeing what you're making

1. **Live slide preview in the editor** — render the selected question through
   the real theme variables and layout while editing. Everything needed exists
   (`themeToCssVars`, the layouts, the draft state is already in React).
   *Verdict: Build. This is phase one.*
2. **WYSIWYG editing on the slide** — type the prompt directly on the preview.
   Inverts the current form-first editor; big UI surgery, same data model.
   *Verdict: Build later; needs design care, zero schema work.*
3. **Slide sorter / filmstrip** — thumbnails of every slide instead of the text
   list. Pure UI over existing data.
   *Verdict: Build later.*
4. **Speaker notes for the host** — per-question notes only the host screen
   shows. One optional string on the question row (real column or presentation
   field), host view already diverges from player view (`HostQuestionView`).
   *Verdict: Schema, easy.*

### Per-slide look

5. **Per-slide background override** — a `background` field in
   `presentationSchema` reusing the *existing* `backgroundSchema` union (solid,
   gradient, mesh, grid, dots, rays). Renderer: apply over `--q-bg` for that
   question. *Verdict: Schema, easy — phase two material.*
6. **Per-slide font/answer-shape override** — same mechanism as 5, reusing
   existing enums. Risk: quizzes that look ransom-note. Maybe accent +
   background is enough. *Verdict: Schema, easy; taste call.*
7. **Image focal point / fit control** — `object-cover` today crops centre; a
   `mediaFit` or focal x/y in presentation fixes decapitated portraits.
   *Verdict: Schema, easy.*
8. **Stickers / emoji decorations on slides** — positioned decorations array in
   presentation `{glyph, x, y, size, rotation}`. Emoji are just text — no
   assets, no licensing. Needs a small canvas-style placement UI.
   *Verdict: Schema + moderate UI. Good mid-roadmap feature.*
9. **Emoji picker for prompts and answers** — a curated, dependency-free emoji
   grid that inserts into the focused field. Emoji already work in prompts —
   this is pure input convenience. *Verdict: Build, small.*
10. **GIFs on slides** — animated GIF/WebP already pass the upload path and
    `<img>` renders them. Upload-your-own GIFs work *today*. Respect
    `prefers-reduced-motion`/theme `animations` flag by freezing first frame
    is the only real work. *Verdict: Build (small polish).*
11. **GIPHY / Tenor search integration** — third-party API from our server or
    the client. Breaks the no-third-party posture on the editor, adds an API
    key + terms (GIPHY requires attribution; Tenor is Google — API terms and
    a privacy-policy mention of the processor). *Verdict: Decision — external
    dependency + licensing + privacy. Do not build without Ollie's call.
    Alternative that needs no decision: upload-your-own GIF, which works now.*

### Motion

12. **Slide transitions** (question → question on the shared screen) — pure
    CSS in `QuestionFrame`/host flow; `animate-pop-in` already exists, and the
    theme `animations` flag plus `prefers-reduced-motion` are the guard rails.
    A `transition` presentation field (cut/fade/slide/zoom) is one enum.
    *Verdict: Schema + CSS, easy-moderate.*
13. **Answer-reveal choreography** — staggered tile entrances, correct-tile
    celebration. CSS keyframes keyed off existing `data-state` attributes.
    *Verdict: Build, small-moderate.*
14. **Confetti on the podium** — tiny dependency-free canvas or CSS particle
    burst, gated by reduced-motion. *Verdict: Build, small.*
15. **Animated theme backgrounds** — drifting mesh blobs etc. CSS animation on
    existing generative backgrounds; performance on classroom hardware is the
    constraint (compositor-only transforms). *Verdict: Build later, careful.*

### Sound

All sound features share three prerequisites: an unlock-on-first-gesture audio
context (mobile browsers), per-screen mute controls, and a decision about
*where sound plays* (host screen only is the sane default — 30 phones a
half-second out of sync is a bad instrument). None of that exists yet; first
sound feature pays the setup cost.

16. **Correct/wrong answer stingers, countdown ticks, lobby/podium fanfares** —
    small bundled audio files played by the host screen at existing state
    transitions (`game:state` already tells every screen everything). Needs:
    sourced sounds with clear licenses (CC0 exists in abundance) — flag:
    verify license per file, keep a manifest. *Verdict: Build + license
    hygiene. The natural "first sound" slice.*
17. **Music per round / per quiz** — the settings schema comment already
    promises music and nothing implements it. Bundled loops (license-check as
    16) or **user-uploaded audio** — the latter is an Assets feature (magic
    bytes for MP3/OGG, size cap, no EXIF equivalent needed) *and* a Decision:
    users will upload copyrighted music; hosting it is a different legal
    posture than hosting their quiz images. *Verdict: bundled loops = Build;
    user uploads = Assets + Decision.*
18. **Host soundboard** — a host-screen panel of one-tap stingers (drumroll,
    airhorn, sad trombone). Same infra as 16; host-only playback means no new
    wire events at all. *Verdict: Build, small, once 16 exists. Crowd
    pleaser.*
19. **Audio questions** ("name this tune") — needs user audio upload
    (Assets + the same Decision as 17) plus playback sync. A whole question
    type. *Verdict: far future; revisit after 16/17.*

### Farther out

20. **Video on slides** — self-hosted video is heavy (size caps, transcoding);
    YouTube embeds break the no-third-party posture and inject its cookies
    into player screens. *Verdict: Decision + Assets; not near-term.*
21. **Slide templates** ("picture round", "lightning round" presets) — canned
    presentation+timing bundles applied on question create. Pure data + UI.
    *Verdict: Build later, easy.*
22. **Reusable media library per account** — "my uploads" picker so an image
    is uploaded once and reused. Needs an Upload DB table (today files are
    disk-only) — also the missing piece for orphan cleanup. *Verdict: Schema
    (new table) + Build; pairs well with any media push.*

## Roadmap

Each phase is independently shippable and leaves the app strictly better.

- **Phase 1 — the live slide preview** *(this session)*. A real-time preview
  panel beside the question editor: the selected question rendered through the
  quiz's actual theme variables, its chosen layout, media, accent override and
  timer state, with a mock answer area per question type. No schema changes,
  no wire changes, no game-path changes — pure editor UI. This is the
  foundation: every later design feature becomes visible the moment it's
  edited.
- **Phase 2 — per-slide looks.** `background` override (reusing
  `backgroundSchema`), image fit/focal control, emoji picker. All schema-cheap;
  the preview from phase 1 makes them feel instant.
- **Phase 3 — motion.** Slide transitions and answer-reveal choreography,
  gated by the theme `animations` flag and `prefers-reduced-motion`.
- **Phase 4 — sound, bundled only.** Audio unlock + mute infrastructure, then
  stingers/countdown/fanfares and the host soundboard, from a license-verified
  bundled set. No user audio uploads in this phase.
- **Phase 5 — media depth.** Upload library table (+ orphan cleanup),
  stickers/decorations, slide templates.
- **Parked pending decisions from Ollie:** GIPHY/Tenor (11), user-uploaded
  audio (17/19), video (20).

## Preview honesty note

Phase 1's preview mirrors the layouts of `QuestionFrame` rather than mounting
the live-game component (which is entangled with sockets, server timers, and
answer submission). The two must be kept visually in step — a comment in each
file points at the other. If they drift, promote the shared parts into one
layout component; that refactor is mechanical and can wait until a real drift
appears.
