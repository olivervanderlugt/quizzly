# Security

## Reporting a vulnerability

Email **[SECURITY CONTACT — fill this in]**. Please don't open a public issue for
anything exploitable. A response within 72 hours is the target.

---

## What's implemented

### Authentication
- **scrypt** password hashing (N=2^17, r=8, p=1 — the OWASP minimum), from
  Node's standard library so there's no native module to compile and no
  architecture-specific build failure at deploy time.
- Session tokens are 256 bits of entropy. **Only a SHA-256 hash is stored** — a
  database dump cannot be replayed as a login. SHA-256 rather than a slow hash is
  correct here: the token is already high-entropy, so there's nothing to
  brute-force and the slow-hash cost would buy nothing.
- Cookies are `httpOnly` (an XSS bug can't exfiltrate the session), `Secure` in
  production, `SameSite=Lax`.
- Sliding expiry: 30 days, refreshed at the halfway point, so active users
  aren't logged out mid-session while abandoned sessions still die.
- Login is rate limited **by IP and by targeted email**, so an attacker can't
  spread attempts across many accounts to stay under an IP-only limit.
- Signup and login return identical messages for "account exists" and "wrong
  password", and run a hash even when the account doesn't exist, so neither
  the response text nor its timing reveals which emails are registered.

### Authorisation
- Every protected read re-checks the session **at the data boundary**
  (`getCurrentUser()`), never in middleware alone. Middleware redirects are a UX
  nicety and can be bypassed by a misconfigured proxy.
- Ownership is checked per action, not just authentication — being signed in is
  not the same as owning *this* quiz. See `ownedQuiz()` in
  `src/app/actions/quiz.ts`.
- "Not found" is returned for resources belonging to other users, so the app
  isn't an oracle for which ids exist.

### The anti-cheat boundary
The naive implementation of a quiz game sends the whole question to the client
and hides the answer in the UI, which means the answer is one devtools panel
away. This codebase does not:

- Players receive `PublicPayload` — the payload with every answer removed. There
  is a unit test asserting the correct answer never appears in the serialised
  player view.
- **Grading happens on the server** against the payload the server holds.
- **Timing is server-authoritative.** Elapsed time is computed from the server's
  own timestamps; the client is never asked how long it took. Response times are
  clamped, so a skewed or tampered clock can't mint points.
- One answer per player per question is enforced by a **database unique
  constraint**, not only by an in-memory check — that's the backstop against a
  race in the socket handler.
- A player's identity comes from server-side socket state, never from the
  message payload.
- Ordering questions are always shuffled, and matching right-hand values are
  detached from their ids, so neither can be read off the array order.

### WebSockets
Following the OWASP WebSocket guidance:
- **Origin validation** on the handshake, via both Socket.IO's CORS config and an
  explicit `allowRequest` check. Without this, any page on the internet could
  open a socket carrying the user's cookies (cross-site WebSocket hijacking).
- Host actions require a valid session cookie **and** ownership of that specific
  game, re-verified server-side on `host:attach`.
- Players are anonymous by design but hold a per-game bearer token, so a socket
  can't impersonate another player by guessing an id.
- `maxHttpBufferSize` is 32 KB. An answer is small; a large frame is hostile.
- Per-socket event budgets on every inbound event, with a separate budget for
  answers.
- Ping timeouts drop dead sockets rather than holding their slots open.

### Web
- **Nonce-based CSP**, generated per request in middleware. `object-src 'none'`,
  `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`.
- HSTS, `X-Frame-Options: DENY`, `nosniff`, a restrictive `Permissions-Policy`,
  and COOP/CORP — applied at the Next.js layer as well as in middleware, since
  middleware can be skipped in some proxy configurations.
- Server Actions carry Next.js's built-in CSRF protection (Origin/Host
  comparison), and `SameSite=Lax` cookies are the second layer.
- The login redirect only accepts same-site paths — no open redirect.
- Every input is validated with Zod at the boundary. JSON columns are parsed
  through schemas on read *and* write, so "JSON column" never means "unvalidated
  column".

### Uploaded images
An upload endpoint is a classic way into a server, so `src/lib/media/` trusts
none of what the uploader controls:
- The type is decided by **sniffing magic bytes**, never the filename or the
  `Content-Type` header. Only JPEG, PNG and WebP pass. **SVG is refused** — it
  is a scriptable document and we serve these same-origin, which would make it
  stored XSS.
- The size is capped at **5 MB server-side**, on the actual bytes rather than on
  the declared `Content-Length`, and decoding is capped at 50 megapixels so a
  small file cannot expand into an enormous bitmap.
- Every accepted image is **re-encoded from decoded pixels to WebP**, which is
  what strips EXIF: no metadata is carried across at all, so a phone photo's GPS
  coordinates never reach the volume. Nothing is ever served back in the
  container it arrived in.
- Writes require the **quiz's owner**, checked per request like every other
  mutation, and the endpoint compares `Origin` against `APP_ORIGIN` because a
  cookie-authenticated multipart POST is otherwise forgeable cross-site.
- Files are written under a **random 128-bit key**, and the key pattern (hex
  plus one known extension) is validated before it can become a path, so
  traversal is rejected rather than sanitised.
- Uploads are rate limited per user, and stored outside the repo on a mounted
  volume.

### Secrets
- Env vars validated at boot; the app **refuses to start** on anything missing or
  still set to a placeholder, and refuses to serve production over plain HTTP.
- User-supplied API keys are encrypted at rest with AES-256-GCM (authenticated,
  so tampering is detected). There is deliberately **no read path** — the
  settings page can report that a key is set, never what it is.
- Raw SDK errors never reach the browser; they're translated to safe messages
  server-side and logged with full detail only on the server.

### Container
- Multi-stage build; build tooling never reaches the runtime image.
- Runs as a **non-root user**.
- Healthcheck verifies database reachability, so a wedged instance gets
  restarted rather than kept in rotation.
- The health endpoint returns no version or dependency detail — health endpoints
  are a well-worn way to fingerprint an unpatched deployment.

---

## Known limitations

Be aware of these before deploying at scale.

1. **Rate limiting is in-memory and per-process.** With more than one instance,
   limits become per-instance. Swap `consume()` in `src/lib/rate-limit.ts` for a
   Redis implementation — the interface is designed for it. See
   `docs/DEPLOYMENT.md`.

2. **Live game state is in-memory and single-instance.** Running multiple
   instances without a Socket.IO Redis adapter *and* shared game state will
   break games. Scale vertically first; see `docs/DEPLOYMENT.md`.

3. **`x-forwarded-for` is trusted for rate-limit keys.** A client can forge it
   unless your reverse proxy overwrites it. It is used only for rate limiting,
   never for authorisation, so the worst case is a bypassed login throttle —
   but configure your proxy to set the header authoritatively.

4. **No nickname profanity filter.** A nickname field in a classroom will
   eventually be misused. Hosts can remove players mid-game, but there is no
   automated filter. Add a deny-list before any school deployment.

5. **No email verification and no password reset.** Accounts are usable
   immediately and a forgotten password cannot currently be recovered. Both need
   an email provider, which this deliberately doesn't depend on.

6. **No account lockout, only rate limiting.** A distributed attacker with many
   IPs is throttled per-email but not locked out.

7. **A pasted image URL is still hot-linked.** Uploaded images are served from
   this origin and leak nothing, but an author can also paste an arbitrary
   HTTPS URL, and those aren't proxied — the question image then discloses
   every player's IP to that third-party host. `img-src https:` is permissive
   by necessity for that route. Uploading rather than pasting avoids it
   entirely; proxying the pasted ones is still unbuilt.

8. **An uploaded image is readable by anyone holding its link.** The URL carries
   128 random bits, so it can't be guessed or enumerated, but there is no
   per-viewer check on the way out — players are anonymous mid-game and have no
   session to check. Treat an uploaded image as public-if-linked, exactly like a
   pasted URL. Removing it from a question does not delete the file either:
   nothing garbage-collects the volume yet, so orphans accumulate and stay
   readable at their old URLs.

9. **`style-src` allows `'unsafe-inline'`.** React inlines the style attributes
   carrying theme variables, and there is no nonce mechanism for style
   *attributes*. A style attribute can't execute script, and every value that
   reaches one is a hex colour validated by `themeSchema`, so the residual risk
   is limited to appearance.

10. **`npm audit` reports three high-severity advisories, all transitive through
   `next`, none reachable in this configuration.** As of the last check:

   - **`postcss`** — arbitrary `.map` file disclosure and path traversal via an
     attacker-controlled `sourceMappingURL` in a CSS comment. PostCSS only ever
     runs here at build time over this repository's own stylesheets. No
     user-submitted CSS exists anywhere in the app.
   - **`sharp`** — inherited libvips CVEs. `sharp` is Next's image optimiser.
     This app uses plain `<img>` tags, never `next/image`, and sets no
     `images.remotePatterns` in `next.config.ts`, so no user-supplied image is
     ever decoded server-side.

   The only fix `npm audit` offers is `next@16`, a major upgrade. Deliberately
   not taken: the exposure is nil today and a framework major deserves its own
   change, not a drive-by. **Re-check this when upgrading Next, and re-check the
   reachability argument if you ever introduce `next/image` or accept CSS from
   users** — either change makes these advisories live.

---

## Hardening checklist

- [ ] Set a real `SECURITY CONTACT` at the top of this file.
- [ ] Terminate TLS and set `APP_ORIGIN` to the `https://` origin.
- [ ] Configure your proxy to overwrite `x-forwarded-for`.
- [ ] Generate fresh `SESSION_SECRET` and `ENCRYPTION_KEY`; never reuse across
      environments.
- [ ] Restrict database network access to the app.
- [ ] Set up automated database backups and test a restore.
- [ ] Keep dependencies patched (`npm audit`); Socket.IO in particular has had
      DoS-class advisories historically.
- [ ] Add nickname moderation if children will use it.
- [ ] Add a retention job for old game data (see `docs/LEGAL.md`).
