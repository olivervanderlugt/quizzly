# Compliance review — western markets

> **This is an engineering compliance review, not legal advice.** It was
> produced by checking the actual code paths on this branch (plus PR #1, noted
> below) against the major western privacy regimes. It exists to make a
> lawyer's review fast and cheap, not to replace it. Anything marked
> **[professional]** needs a qualified professional before commercial use.

**How this was verified:** against the code, not the docs. Each "handled"
claim cites the file that implements it. Items delivered by the still-open
**PR #1** (`claude/quizzly-finalization`: password reset, GDPR export, age
gate, retention sweep) are marked *PR #1 — pending merge*; they are not on
`main` until that PR lands.

**Priority labels:** **must** = do before operating publicly for real users;
**should** = do before scale or schools; **could** = worthwhile hardening.

---

## 0. The two decisions everything else waits on

| Decision | Why it blocks |
|---|---|
| **Contact details / legal entity** — every `[BRACKETED]` field in `/privacy` and `/terms` | Both pages are templates with operator banners. GDPR Art. 13 requires controller identity and contact; CCPA and PIPEDA equivalents too. **must** |
| **Hosting region** — where the Postgres and the container actually run | Determines the transfer story (GDPR Ch. V, PIPEDA, APPs), the `[REGION/COUNTRY]` field in `/privacy`, and whether an EU/UK Art. 27 representative is needed. **must** |

Also Ollie's call, lower stakes: the **minimum age wording** (PR #1 gates at
"16 or the digital age of consent where I live" — right default for EU;
see COPPA below), the **retention period** number, and whether to appoint a
**breach-response contact**.

---

## 1. What the code actually does with data (verified)

The compliance posture rests on facts checked in this pass:

- **Players are anonymous.** A `Player` row is nickname, score, connection
  flags (`prisma/schema.prisma`). Answers carry response content and timing.
  No email, IP, or device ID is stored against play sessions; rate limiting is
  in-memory (`src/lib/rate-limit.ts`), so IPs never touch the database.
- **The player page renders no game data server-side**; everything arrives
  over the socket after join (`docs/ARCHITECTURE.md` §2, verified in
  `src/app/play/[pin]/page.tsx`).
- **One cookie.** The session cookie is httpOnly, `secure` in production,
  SameSite=Lax (`src/lib/auth.ts:42`). No analytics, no third-party requests
  from any page; fonts are system stacks by design (`src/lib/theme.ts`).
- **Passwords** are scrypt-hashed; session tokens and reset tokens stored
  hashed (`src/lib/crypto.ts`, PR #1 `src/lib/password-reset.ts`).
- **Account deletion is a hard cascade delete** — quizzes, questions, games,
  players, answers (`src/app/actions/settings.ts:56`).
- **AI generation** sends topic and pasted source text to Anthropic only when
  an operator or user key is configured; player data never goes to the AI
  path (`src/lib/ai/`). Per-user keys are AES-256-GCM encrypted at rest.
- **Nicknames are screened** by a leetspeak-folding deny-list, English and
  Dutch (`src/lib/nickname.ts`).
- **Uploads (this branch):** magic-byte type check, 5 MB cap, EXIF/XMP and
  text metadata stripped before disk — a phone photo's GPS never persists
  (`src/lib/uploads.ts`); files get random names, served same-origin.
- **PR #1 adds:** Art. 15 JSON export that reads collab questions only
  through the blind path and excludes other players' nicknames from hosted
  game history; signup age checkbox; `DATA_RETENTION_DAYS` daily sweep
  deleting old games by cascade; password reset with hashed single-use
  tokens and enumeration-safe responses.

---

## 2. EU GDPR

| Item | Status | Priority |
|---|---|---|
| Controller identity & contact in notice (Art. 13) | **Needs decision** — template placeholders | must |
| Lawful bases stated | **Handled** in template text (Art. 6(1)(b) accounts; player basis has a PICK-ONE placeholder — pick it) | must |
| Right of erasure (Art. 17) | **Handled** — hard cascade delete from Settings | — |
| Erasure gap: **uploaded images survive account/quiz deletion** | **Missing** — files in `UPLOADS_DIR` are not deleted when the quiz or account is (documented in README as a known limitation). An erasure request that says "everything" includes images the user uploaded. Needs an uploads table keyed to owner + cleanup on delete (roadmapped in docs/SLIDE-DESIGNER.md phase 5) or a documented manual process | must (before real users upload) |
| Right of access (Art. 15) | **Handled, PR #1 — pending merge** — Settings → export | must (merge) |
| Portability (Art. 20) | **Handled** — quiz export/import as files (`src/app/api/quiz/[id]/export`), account export in PR #1 | — |
| Rectification (Art. 16) | **Partially handled** — users edit their own quizzes freely, but there is no UI to change display name or email (verified: no such server action exists). Handle those manually on request, or add a small profile form | could |
| Retention (Art. 5(1)(e)) | **Handled, PR #1 — pending merge** — `DATA_RETENTION_DAYS`; **needs decision**: the number, and it must match `/privacy` | must |
| Records of processing (Art. 30) | **Missing** — a document Ollie must write; §1 above is most of its content | should |
| DPIA (Art. 35) | **Missing** — required before school-scale deployment; the minimal-data design makes it short | should (schools) |
| Processor agreements (Art. 28) — hosting, DB, SMTP, Anthropic | **Needs decision** — depends on chosen providers; Anthropic's commercial terms include a DPA to reference when AI is on | must |
| International transfers (Ch. V) | **Needs decision** — hosting region; if data is in the US, name the safeguard (DPF membership or SCCs) in `/privacy` | must |
| Art. 27 EU representative (if Ollie operates from outside the EU targeting it — or vice-versa UK) | **Needs decision** [professional] | should |
| Breach notification readiness (Art. 33/34 — 72h) | **Missing** — no documented process; decide who notices and who calls whom | should |
| Consent (cookies / ePrivacy) | **Handled by design** — single strictly-necessary cookie, no trackers, nothing fetched cross-origin, so no consent banner is required. Preserve this property; any analytics or GIPHY-style embed breaks it | — |
| Children / age of consent (Art. 8) | **Handled, PR #1 — pending merge** — self-declared 16+ checkbox at signup, stored nowhere. Proportionate for a service holding no age data; **needs decision** if Ollie targets a country where the threshold is 13–15 | must (merge) |

## 3. UK GDPR + Age Appropriate Design Code

Substantively identical to the EU column above (UK GDPR mirrors it; ICO is
the authority and is already named in the privacy template). Additional
UK-specific points:

| Item | Status | Priority |
|---|---|---|
| AADC conformance for child-accessible services | **Largely handled by design** — play path collects no personal data, no profiling, no nudging, no geolocation; that is the strongest position the code can hold | — |
| UK representative (if operating from outside the UK into it) | **Needs decision** [professional] | should |
| ICO registration fee (most UK controllers must pay it) | **Needs decision** — applies only if Ollie is UK-established | should |

## 4. US — COPPA

| Item | Status | Priority |
|---|---|---|
| Players under 13 | **Handled by design** — COPPA turns on collecting personal information from children; the play path stores a self-chosen nickname and answers with no persistent identifier, no contact information, and no tracking. A nickname used only within one game and deleted on retention sweep is the strongest available posture short of collecting nothing at all | — |
| Accounts by under-13s | **Handled, PR #1 — pending merge** — the 16+ age gate screens them out; COPPA liability attaches on *actual knowledge*, so honour it: if Ollie learns an account holder is under 13, delete the account | must (merge) |
| Nickname as "online contact info" | **Handled** — nicknames cannot be used to contact anyone (no chat, no profiles) | — |
| School deployments | **Needs decision** — if a school directs children to *create accounts* (not just play), COPPA's school-consent pathway and a written agreement apply [professional] | should (schools) |

## 5. US — CCPA/CPRA (California)

| Item | Status | Priority |
|---|---|---|
| Applicability | **Likely not applicable** — CCPA applies above thresholds ($25M+ revenue, or 100k+ consumers' data, or selling data). A small self-hosted deployment is far below them. Revisit at scale [professional at that point] | — |
| "Do not sell/share" | **Handled by design** — no sale, no sharing for advertising, no cross-context behavioural ads; say so in `/privacy` (the template already does) | — |
| Notice at collection, access/deletion rights | **Handled in substance** by the GDPR-grade notice + export + delete once PR #1 merges — CCPA rights are a subset of what's built | — |

## 6. Canada — PIPEDA

| Item | Status | Priority |
|---|---|---|
| Consent + purpose limitation | **Handled in substance** — account signup with terms/privacy links (PR #1) covers meaningful consent for the account relationship; players' minimal data fits the "reasonable expectations" standard | — |
| Openness / contact for privacy questions | **Needs decision** — same contact-details placeholder | must |
| Access & correction | **Handled** once PR #1 merges (export; correction manual) | — |
| Breach of security safeguards — report + record | **Missing** — PIPEDA requires *keeping records of all breaches*; fold into the breach-readiness note above | should |

## 7. Australia — Privacy Act / APPs

| Item | Status | Priority |
|---|---|---|
| Applicability | **Likely exempt today** — the small-business exemption (< A$3M turnover) covers most self-hosted deployments, but reform to remove that exemption has been progressing; revisit before commercial AU launch [professional] | — |
| APP 1 privacy policy, APP 12/13 access & correction | **Handled in substance** by the same notice + export + delete once placeholders are filled | — |
| Notifiable data breaches scheme | **Missing** — same breach-readiness process; AU requires notifying the OAIC for eligible breaches | should |

## 8. Cross-cutting items

| Item | Status | Priority |
|---|---|---|
| **Patent risk (US)** — docs/LEGAL.md §4: Kahoot! is a defendant in live US litigation over "timed quiz + real-time scoreboard" (US 10,339,825); this codebase has a real-time scoreboard | **Needs a professional** — freedom-to-operate opinion before commercial US launch. Engineering note: do not add team/league play before that opinion; it moves toward the representative claim | must (US commercial) [professional] |
| Trade marks / trade dress | **Handled** — no Kahoot marks or look-alike branding in the product; keep it that way in marketing | — |
| EU DSA (hosting user content: public quizzes, Discover) | **Mostly out of scope at this size** — micro/small enterprises are exempt from the heavier tiers, but a point of contact and clear terms are baseline; the terms template covers acceptable use and moderation. Revisit at scale [professional] | could |
| User-uploaded images: illegal/abusive content | **Partially handled** — uploads are quiz-owner-only (rate-limited, size-capped) and public exposure requires the owner making a quiz public; there is **no report/takedown route** beyond contacting the operator. Add a report link or documented abuse contact when Discover grows | should |
| Uploaded images of identifiable people | **Needs disclosure** — `/privacy` predates uploads; add a line that uploaded images are stored until the quiz/account is deleted (and fix the deletion gap in §2) | must (with §2 gap) |
| EU AI Act | **Handled in posture** — quiz drafting is not Annex III high-risk; the UI frames output as drafts. Do not market it for graded student assessment without re-review (docs/LEGAL.md §5) | — |
| Accessibility (EAA / EN 301 549 — in force for consumer services since mid-2025) | **Partially handled** — focus states, reduced-motion, alt-text enforcement on question images are real; no formal audit or accessibility statement exists. Worth an audit before commercial EU launch | should |
| Email deliverability & content (PR #1 SMTP) | **Handled** — password-reset mail only, transactional, no marketing; no CAN-SPAM/CASL issues as built | — |

---

## 9. The shortlist for Ollie

**Must, before going live with real users:**
1. Fill in the `/privacy` and `/terms` placeholders (entity, contact,
   jurisdiction, retention number) and delete the operator banners.
2. Choose the hosting region and write the matching transfer statement.
3. Merge PR #1 (export, age gate, retention, reset) — three of the "handled"
   rows above depend on it.
4. Set `DATA_RETENTION_DAYS` to the number stated in the notice.
5. Close the uploads-vs-erasure gap (or interim: document a manual wipe of a
   deleted user's files) and mention uploaded images in `/privacy`.
6. DPAs with the chosen hosting/DB/SMTP providers (+ Anthropic if AI is on).

**Before schools or scale:** Art. 30 record, DPIA, breach-response process
(covers EU/UK/PIPEDA/AU in one document), nickname deny-lists for the
deployment's languages, report/takedown contact for public content.

**Professional review required [professional]:** US freedom-to-operate
opinion before commercial US launch (patent §8); representative requirements
(Art. 27 EU/UK); school/COPPA agreements; CCPA/AU applicability once the
service has real revenue or volume.
