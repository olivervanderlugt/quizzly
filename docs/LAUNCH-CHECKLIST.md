# Launch checklist

Everything the code can do is done and tested. What remains is exactly the set
of things that need an account, a credential, or a decision with your name on
it. Do them in order; each step says where it happens and what done looks like.

The app stays fully editable after launch: push to `main`, CI runs, redeploy.
Nothing below bakes anything in.

---

## 1. Pick where it runs (one decision)

The app is one Docker container plus a Postgres. It needs a held-open WebSocket,
so serverless (Vercel/Netlify) is out — see `docs/DEPLOYMENT.md` for the full
comparison. Short version:

| Option | Effort | Cost ballpark | Notes |
|---|---|---|---|
| **Railway** | least | ~$5–10/mo | Repo + Postgres plugin, no config file needed |
| **Fly.io** | small | ~$5–10/mo | `fly.toml` is committed and ready |
| VPS + Compose | most control | ~$5/mo + your time | `docker-compose.yml` + Caddy in front |

## 2. Create the account and deploy

**Railway:** New project → Deploy from GitHub repo → add PostgreSQL service →
set the variables from step 3 → set the start command from `docs/DEPLOYMENT.md`.

**Fly:** install `flyctl`, then `fly launch --copy-config --no-deploy`,
`fly postgres create`, `fly postgres attach`, `fly secrets set …` (step 3),
`fly deploy`.

**VPS:** clone the repo, `cp .env.example .env`, fill it in, `docker compose up
-d --build`, put Caddy in front (config in `docs/DEPLOYMENT.md`).

## 3. Set the environment

Required — generate the two secrets *separately*:

```bash
openssl rand -base64 32   # SESSION_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY
```

```
NODE_ENV=production
APP_ORIGIN=https://<your-domain>      # exact, no trailing slash
DATABASE_URL=<from your provider>     # keep sslmode=require
SESSION_SECRET=<generated>
ENCRYPTION_KEY=<generated>
```

Optional features (each one switches on by itself; the boot log confirms):

```
ANTHROPIC_API_KEY=...          # AI question drafting (console.anthropic.com)
SMTP_HOST=... EMAIL_FROM=...   # password reset — see step 4
DATA_RETENTION_DAYS=90         # or whatever your privacy notice will say
```

## 4. Email, so password reset works (recommended)

Any SMTP provider works. Resend and Postmark have free tiers that cover a small
deployment; a workspace mailbox works too.

1. Create the account, verify your sending domain (their guided DNS steps).
2. Copy the SMTP credentials into the environment:
   `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER`, `SMTP_PASS`,
   `EMAIL_FROM="Quizzly <no-reply@yourdomain>"`.
3. Restart. The boot log should read "Email: enabled … password reset is
   offered", and the login page grows a "Forgot your password?" link.

Skip this and everything else still works — reset is simply not offered.

## 5. Fill in the legal placeholders (15 minutes, your details)

Every `[BRACKETED]` field, then delete the two amber "Operator note" banners:

- `src/app/privacy/page.tsx` — legal entity name, address, contact email,
  hosting + database provider names, region, date.
- `src/app/terms/page.tsx` — entity name, age threshold (16 unless your
  country lowered it), jurisdiction, date.
- `SECURITY.md` line 5 — a real security contact address.

Commit and push; that's a normal deploy.

## 6. Domain (optional but recommended)

Buy the domain, point DNS at the platform (they show the exact records), set
`APP_ORIGIN` to the final `https://` origin, redeploy. `APP_ORIGIN` drives
WebSocket origin checks — if games won't start but pages load, this is wrong.

## 7. Backups

Switch on your provider's Postgres backups (Railway/Fly: a toggle + schedule),
then do one restore test. `docs/DEPLOYMENT.md` has the `pg_dump` recipe for the
VPS path. An untested backup is a hypothesis.

## 8. Prove it works (10 minutes)

1. Boot log shows the right feature lines, `/api/health` returns OK.
2. Sign up, tick the age box, build a two-question quiz, host it.
3. Join from your phone with the PIN, answer, see the podium.
4. "Forgot your password?" → email arrives → link sets a new password.
5. Settings → Download my data returns your JSON.

## After launch: how you keep improving

- Work lands on a branch, PR, CI runs (typecheck, unit + socket integration
  tests against real Postgres, build, Docker image), merge to `main`, redeploy.
  Migrations apply automatically on boot (`start:migrate` / Fly release
  command).
- The Hangar (`project-management` repo) tracks what's next; the repo docs
  (`CLAUDE.md`, `docs/ARCHITECTURE.md`) keep any future session productive.

## Known limits to keep in mind (all documented, none launch-blocking)

- Run **exactly one instance**; scale up, not out (`REDIS_URL` is reserved,
  unused).
- Nickname filter covers English + Dutch; extend for other audiences.
- Read `docs/LEGAL.md` §4 (patent risk) before commercialising, and the
  checklist in §6 before opening to strangers at scale.
