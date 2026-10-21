# Ask 38 — U10b: Email + password login

## Objective
Sam wants a normal email + password sign-in on alphaecho.io. Magic link stays as a fallback ("Email me a sign-in link instead"). Passwords are set by a droplet-only script that the account owner runs and types into. No self-signup, and no emailed "forgot password" this unit. This supersedes the PRD's "passwordless magic-link" stack decision (Sam-approved 2026-10-15).

Read `CLAUDE.md` first; its hard rules apply. Follow Sam's `app-auth` skill conventions: generic errors with no account oracle, rate limits, and secrets never logged.

## Measured facts (don't re-derive)
- `users.email` is **`citext UNIQUE`** (core-schema migration). `WHERE email = $1` is therefore already case-insensitive. **No case-handling code is needed**; just trim the input. (This was verified on the droplet: a mixed-case address finds the account.)
- **`server/auth.js`** (mounted at `/api/auth`):
  - constants `SESSION_TTL_MS` (30 days) and `RATE_LIMIT_WINDOW_MS` (1 h); helper `genRawToken()`;
  - limiters built with `rateLimit({...})` from `express-rate-limit`, with `ipKeyGenerator` for the IP fallback;
  - `GET /verify` creates the session: inserts `sessions (user_id, token_hash, expires_at)` with `hashToken(raw)`, then sets the cookie `SESSION_COOKIE` (`wh_session`) with `{ httpOnly:true, secure:true, sameSite:"lax", path:"/", maxAge: SESSION_TTL_MS }`.
  - Extract that insert-plus-cookie into one internal `issueSession(res, userId)` and use it from both `/verify` and the new `/login`. `/verify`'s behavior must not change.
- `requireUser` (`server/authz.js`) selects explicit columns (`u.id, u.email, u.name, u.role`). No query in `server/` uses `SELECT *` or `u.*`. Keep it that way: `password_hash` must never be selected anywhere except the login lookup.
- **Migrations:** `server/migrations/*.sql` with `-- Up Migration` / `-- Down Migration` sections; the latest is `1789049749489_job-runs.sql`. Create `server/migrations/1789500000000_user-password.sql`. `ops/deploy.sh` runs `migrate:up` on deploy.
- Test-file conventions: copy the guards and helpers from `server/test/auth.test.js` (in-process `createApp(pool)`, `makeUser`, `getSessionCookie`, the `outbox` import from `mail.js`). `server/package.json`'s `test` script lists files explicitly; append the new file.
- **`server/test/idor.test.js`:** `MATRIX` has 33 entries, plus assertions `actual.length === 33` and `MATRIX.length === 33`. Its signed-out sweep requires each public route other than health/logout to return a status that is neither 401 nor 5xx when sent a `{}` body.
- **Local test recipe** (scratch DB `workhart_scratch_test` exists; migrate it before running tests):
  `cd server && TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod NODE_ENV=test node --test test/*.test.js`
  Baseline: **60/60**.
- **Frontend sign-in** is in `src/Workhart.jsx`, `if (screen === "login") { if (SERVER_MODE) { … } }` at around line 1663:
  - `submitEmail()` POSTs `/api/auth/request-link` and sets `authStage` `"email"` → `"sent"`;
  - state `authEmail`, `authBusy`, `authError` (lines 751–754);
  - after a session exists, `refetchBootstrap()` (around line 976) GETs bootstrap and calls `hydrateFromBootstrap`, which routes to the right screen;
  - `apiCall(path, init)` is the fetch wrapper. The prototype login (non-`SERVER_MODE`) must stay unchanged.
- `scrypt`, `randomBytes` and `timingSafeEqual` come from `node:crypto`. **No new npm dependencies.**

## 1. Migration `server/migrations/1789500000000_user-password.sql`
Up: `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;`. Down: `ALTER TABLE users DROP COLUMN IF EXISTS password_hash;`. Nothing else.

## 2. `server/password.js` (new)
- `hashPassword(plain)` → `scrypt$16384$8$1$<saltB64>$<hashB64>` (16-byte random salt, 64-byte key, using `crypto.scrypt` promisified).
- `verifyPassword(plain, stored)` → boolean: parse the stored string, recompute, compare with `timingSafeEqual`. Return `false` (never throw) for `null`, `undefined` or a malformed `stored` value.
- `validatePassword(plain)` → `true` iff it's a string of 10–200 characters.

## 3. `POST /api/auth/login` (in `server/auth.js`)
- Limiters: per IP 30/hour, and per email 10/hour (same key logic as `requestLinkEmailLimiter`). Both respond 429 `{error:"too_many_requests"}`.
- Body `{email, password}`. If either is missing or not a non-empty string → **400** `{error:"invalid_request"}`.
- `SELECT id, password_hash FROM users WHERE email = $1` with the trimmed email.
- If the user doesn't exist, or has a null `password_hash`, still run `verifyPassword` against a module-level dummy hash (computed once at module load) so response timing doesn't reveal whether the account exists.
- Any failure → **401** `{error:"invalid_credentials"}`, with exactly the same body in every case.
- Success → `issueSession(res, user.id)` → **200** `{ok:true}`.
- Never log the email, the password, the hash or the request body. One `console.error("login error: <message>")` on an unexpected exception (→ 500 `{error:"internal_error"}`).

## 4. `server/scripts/set-password.js <email>` (new, droplet-only; run with `node --env-file=/etc/workhart/env`)
- Uses `DATABASE_URL`; fail fast if it's unset; usage error if `<email>` is missing.
- Reading the password:
  - **stdin is a TTY:** prompt `New password:` and `Repeat password:` with **no echo** (raw mode, or a muted readline). On a mismatch, exit 1.
  - **stdin is not a TTY** (tests): read the first line from stdin.
- `validatePassword` fails → exit 1 with `password must be 10–200 characters` and nothing written.
- `UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id`. No row → exit 1 with `no such user`.
- Success prints exactly `password set for <email>`. Never print the password or the hash.

## 5. Frontend (`src/Workhart.jsx`, server-mode login only)
- Add `authPassword` state. When `authStage === "email"`, render:
  1. the Email input: unchanged, plus `autoComplete="username"`;
  2. a Password input: `aria-label="Password"`, `type="password"`, `autoComplete="current-password"`, same `inp` style, Enter submits;
  3. the primary button **"Sign in"** → `submitPassword()`;
  4. below it, a text-style button (same look as the existing "Change" underline button) **"Email me a sign-in link instead"** → the existing `submitEmail()`. It needs only the email field.
- `submitPassword()`: POST `/api/auth/login {email, password}`.
  - 200 → clear `authPassword`, then `await refetchBootstrap()`.
  - 401 → `"Wrong email or password."`
  - 429 → `"Too many attempts — try again later."`
  - anything else → `"Something went wrong — try again."`
  - Use `authBusy` while the request is in flight. Never store the password anywhere except component state, and clear it after any attempt.
- The `"sent"` stage and the `?auth=expired` banner are unchanged.

## Tests — new `server/test/password.test.js` (exactly these 8 tests), then update `idor.test.js`
1. `hashPassword`/`verifyPassword`: the round trip is true; a wrong password is false; null or malformed `stored` is false and doesn't throw; hashing the same password twice gives different strings.
2. Login happy path: set `password_hash` directly with `hashPassword` → POST login → 200, a `wh_session` cookie is set, and `GET /api/auth/me` with it → 200 for that user.
3. Login with the email in different case (`.toUpperCase()`) → 200 (citext).
4. Wrong password, unknown email, and a user with null `password_hash` → all **401** with an identical JSON body.
5. Missing password, missing email, and a non-string password → 400 `invalid_request`.
6. The 11th login attempt for the same email inside the window → 429.
7. As that user (and as an admin for the admin routes): the response text of `/api/auth/me`, `/api/bootstrap`, `/api/admin/users` and `/api/admin/users/:id/overview` contains neither `password_hash` nor `scrypt$`.
8. `set-password.js`, spawned with `DATABASE_URL=TEST_DATABASE_URL` and the password piped on stdin:
   - valid → exit 0, stdout is exactly `password set for <email>`, and the stored hash verifies;
   - unknown email → exit 1;
   - a 5-character password → exit 1 and the hash is unchanged.

**`idor.test.js`:** add `{ method: "POST", path: "/api/auth/login", access: "public" }` to `MATRIX` and change both `33` assertions to `34`. No other change to that file.

## Hard rules
- **Allowed files:**
  - new: `server/migrations/1789500000000_user-password.sql`, `server/password.js`, `server/scripts/set-password.js`, `server/test/password.test.js`;
  - edited: `server/auth.js`, `server/package.json` (test-script line only), `server/test/idor.test.js` (as above), `src/Workhart.jsx` (server-mode login block + `authPassword` state only).
  - Nothing else.
- Existing magic-link behavior is unchanged: `auth.test.js`'s 8 tests pass unmodified.
- No new dependencies. One migration only.
- **No agent ever types, chooses, prints or stores a real password.** Tests generate random throwaway passwords. Sam sets his own via the script in his own terminal (LIVE step).
- No commits, no deploy, no ssh.

## Green-light
Run every line from the repo root.
```
npm run build                                                                                      # PASS: exit 0
VITE_SERVER_MODE=1 npm run build                                                                   # PASS: exit 0
cd server && TEST_DATABASE_URL=postgres:///workhart_scratch_test node_modules/.bin/node-pg-migrate up -d TEST_DATABASE_URL   # PASS: applies 1789500000000_user-password
cd server && TEST_DATABASE_URL=postgres:///workhart_scratch_test node_modules/.bin/node-pg-migrate up -d TEST_DATABASE_URL   # PASS: "No migrations to run!"
cd server && TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod NODE_ENV=test node --test test/*.test.js   # PASS: tests 68, pass 68, fail 0
grep -c "test/password.test.js" server/package.json                                                # PASS: 1
grep -ln "password_hash" server/*.js server/scripts/*.js                                           # PASS: exactly server/auth.js and server/scripts/set-password.js
grep -nE "console\.(log|error)\(.*(password|req\.body|email)" server/auth.js server/password.js    # PASS: no output
grep -c "speechSynthesis" src/Workhart.jsx                                                         # PASS: 0
git status --porcelain -- src server                                                               # PASS: only the allowed files above beyond the pre-existing entries (RM src/Forge.jsx -> src/Workhart.jsx, M src/main.jsx, M server/package.json, ?? server/test/idor.test.js, ?? src/history.js, ?? src/history.test.js)
./ops/deploy.sh                                                                                    # LIVE — PASS: deploy OK (migration applied)
ssh workhart 'cd /srv/workhart/server && npm test'                                                 # LIVE — PASS: tests 68, fail 0
# LIVE — SAM in his own terminal: ssh -t workhart 'cd /srv/workhart/server && node --env-file=/etc/workhart/env scripts/set-password.js hey@blueroutevineyard.com'   → "password set for hey@blueroutevineyard.com"
# LIVE — SAM at https://alphaecho.io: email + password → Sign in → lands signed in (import screen, since the account is still empty)
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://alphaecho.io/api/auth/login -H 'content-type: application/json' -d '{"email":"nobody@idor-test.local","password":"definitely-wrong-1"}'   # LIVE — PASS: 401
curl -s https://alphaecho.io/api/health                                                            # LIVE — PASS: ok true, db true
```
Report every line PASS/FAIL with actual output, then stop.
