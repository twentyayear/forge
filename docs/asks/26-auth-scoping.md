# Ask 26 — U2: Magic-link auth, sessions, role middleware, scoping contract

## Objective
Real passwordless auth on the droplet API: Resend-delivered magic links, server-side cookie sessions, `requireUser`/`requireAdmin` middleware, and the user-scoping contract every later endpoint copies — proven by an IDOR test. Backend only: the prototype's fake sign-in screen is NOT touched (U3 wires it). Read `CLAUDE.md` first; hard rules apply (never print secrets, commit nothing).

## The invariant (from Sam's app-auth skill — the whole point of this unit)
**The acting user id NEVER comes from request params/body — it derives from the session.** Handlers use `req.user.id`. The only routes that may take a user id as input are `/api/admin/*`, gated by `requireAdmin`. Every scoped route gets an authz test proving cross-user access returns nothing.

## Precondition (STOP if missing)
`/etc/workhart/env` must already contain `RESEND_API_KEY` (Sam places it — never ask for it, never print it, not even a prefix). Check presence with `ssh workhart "grep -c '^RESEND_API_KEY=' /etc/workhart/env"` → must be 1. If 0, stop and report blocked.

## 1. Config (fail-fast at boot in production)
New env (add placeholders to `.env.example`): `RESEND_API_KEY` (must start `re_` — validate format at boot, print only "invalid format", never the value), `MAIL_FROM` (default `WORKHART <onboarding@resend.dev>` until Sam verifies a domain in Resend), `APP_BASE_URL` (`https://alphaecho.io`). Add `MAIL_FROM` + `APP_BASE_URL` to `/etc/workhart/env` via remote append (values above, not secrets).

## 2. Fix Kyle's seed email (fix-forward, never edit an applied migration)
Kyle must be reachable at a real inbox. New migration: `UPDATE users SET email='hey+kyle@blueroutevineyard.com' WHERE email='kyle@alphaecho.io';` and update `seed.js` to the new address (stays idempotent against the migrated row).

## 3. Mailer (`server/mail.js`)
Plain `fetch` POST to `https://api.resend.com/emails` — hardcode that origin (Sam's rule: third-party clients pin origin before sending credentials), Bearer `RESEND_API_KEY`. Export `sendMagicLink(email, url)`: minimal branded HTML (black bg, WORKHART wordmark text, blue #29ABE2 button "Sign in to WORKHART", plain-text fallback link, "expires in 15 minutes" line). When `NODE_ENV=test`: do NOT call Resend — push `{email, url}` onto an exported `outbox` array (this is how tests capture links). On Resend non-2xx: log status + Resend error message (never the key), return failure; the route still answers generically.

## 4. Auth routes (`server/auth.js`, mounted in index.js)
- `POST /api/auth/request-link` `{email}` — always responds `200 {ok:true}` with identical body/timing whether or not the account exists (no oracle). If a user matches (citext): create magic_link_tokens row — token = 32 random bytes base64url, store ONLY sha256 hex, expires 15 min. Email link: `${APP_BASE_URL}/api/auth/verify?token=<raw>`.
- `GET /api/auth/verify?token=` — valid+unused+unexpired: set `used_at`, create sessions row (same 32-byte/sha256 pattern, 30-day expiry), set cookie `wh_session` (httpOnly, Secure, SameSite=Lax, Path=/, maxAge 30d), redirect 302 → `/`. Invalid/expired/reused: redirect 302 → `/?auth=expired` (no detail leak).
- `POST /api/auth/logout` — delete the session row, clear the cookie, `{ok:true}`.
- `GET /api/auth/me` — via requireUser: `{id, email, name, role}`; else 401.
- Rate limits (`express-rate-limit`, in-memory is fine single-process): request-link 5/hour per email + 20/hour per IP (429 after); verify 30/hour per IP. Generic 429 body.

## 5. Middleware (`server/authz.js`)
- `requireUser` — cookie → sha256 → sessions join users; expired/missing → 401 `{error:"unauthorized"}`. Attaches `req.user = {id, email, name, role}`. Update `last_seen_at` at most once per 5 min per session.
- `requireAdmin` — after requireUser; role !== 'admin' → 404 (not 403 — don't advertise admin surface exists).

## 6. Reference scoped routes (the pattern U3+ copies)
- `GET /api/checkins?from=&to=` (requireUser) — session user's checkins only, ordered by day. This is the canonical scoped read.
- `GET /api/admin/users` (requireAdmin) — id, email, name, role, created_at, last check-in day per user.

## 7. Tests (`server/test/auth.test.js`, node:test, TEST_DATABASE_URL only — same refuse-to-run guard as schema.test.js; boot the app in-process on an ephemeral port with NODE_ENV=test)
1. Happy path: request-link → capture from `outbox` → verify → cookie set → `/api/auth/me` 200 with the right email.
2. Reused link → second verify redirects to `?auth=expired`, no new session created.
3. Expired link (insert token with past expiry directly) → rejected.
4. Logout → session row gone; subsequent `/me` 401.
5. Unknown email on request-link → 200 generic, outbox empty, no token row.
6. **IDOR:** users A + B with checkin rows each (direct DB insert); GET /api/checkins as A returns ONLY A's rows.
7. Role gate: `/api/admin/users` as normal user → 404; as admin → 200 including both users.
8. Rate limit: 6th request-link for the same email inside the window → 429.

## Hard rules
- Raw tokens never stored or logged — hashes only. Secrets never printed anywhere including reports.
- No JWTs, no localStorage tokens — httpOnly cookie + Postgres sessions only (revocable).
- Frontend untouched. No commits. Fix-forward migrations only.

## Green-light (run each, report PASS/FAIL with actual output)
```
ssh workhart "grep -c '^RESEND_API_KEY=' /etc/workhart/env"          # 1 (presence only — NEVER cat the line)
ssh workhart 'cd /srv/workhart/server && npm run migrate:up:test && npm test'   # schema + auth suites all pass
./ops/deploy.sh                                                       # green end-to-end
curl -s -o /dev/null -w "%{http_code}\n" https://alphaecho.io/api/auth/me      # 401
curl -s -X POST https://alphaecho.io/api/auth/request-link -H 'content-type: application/json' -d '{"email":"hey@blueroutevineyard.com"}'   # {"ok":true}
ssh workhart 'journalctl -u workhart-api --since "5 min ago" --no-pager | grep -ci "resend"'   # >=1 send-attempt log line (message id ok, no key material)
curl -s "https://alphaecho.io/api/auth/verify?token=bogus" -o /dev/null -w "%{redirect_url}\n"  # ends in /?auth=expired
for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code} " -X POST https://alphaecho.io/api/auth/request-link -H 'content-type: application/json' -d '{"email":"ratelimit@example.com"}'; done; echo   # last one 429
ssh workhart "sudo -u postgres psql -d workhart -Atc \"select email from users where role='admin'\""  # hey+kyle@blueroutevineyard.com
```
The real-inbox click-through (Sam receives the email and lands signed in) is verified by Fable/Sam after the build — report everything above, then stop.
