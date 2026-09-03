# WORKHART — PRD

## Current milestone: M4 — Real backend + Kyle coaching platform

### Objective
Turn the localStorage prototype into a real multi-user product on the **alphaecho.io testing droplet** (137.184.19.44, `ssh workhart`). Two backend purposes:
1. **User data of record** — all historical workout, check-in, fuel, and profile data lives in Postgres, per user.
2. **Kyle as coach/admin** — Kyle (admin role) creates workouts for specific users, monitors their progress, and replies to it both manually and automatically via AI.

Sam is the only beta user, but the architecture is multi-user from day one (global rule).

### Success criteria (milestone green-light)
- Sam signs in at https://alphaecho.io, his full real history (imported) renders in the existing app UI, and every new check-in / logged workout / fuel entry lands in Postgres — no `forge.*` data keys as source of truth.
- Kyle (admin) can: see the user roster, open Sam's dashboard, build a workout and assign it to Sam for a date, and it appears in Sam's app.
- After Sam logs a workout or check-in, an AI-drafted Kyle reply (referencing his actual numbers) appears — manual-approve by default, auto-send toggleable.
- No user can read or write another user's rows (scripted IDOR test passes).
- workhart.netlify.app (prod prototype) untouched throughout.

### Environments
- **Prod (prototype):** workhart.netlify.app — Netlify CI off `main`. Do not break it.
- **Testing (this milestone):** alphaecho.io — DO droplet 137.184.19.44, Ubuntu 24.04, 1 vCPU/2GB. DNS (apex + www) already points here. nginx serves the built frontend + proxies `/api` to Node; Postgres 16 local on the droplet.

### Stack decisions (made; flag before changing)
- Node 22 + Express, Postgres 16, pg-boss for jobs (`jobs-and-queues` skill; no Temporal).
- Auth: passwordless magic-link + session cookies (`app-auth` skill). Roles: `admin` (Kyle), `user`.
- AI replies: Claude API, latest Sonnet model, server-side only.
- Frontend: the existing Vite/React app, extended — server data layer replaces localStorage as source of truth; the Kyle console is a role-gated section of the same app (one deploy).
- `/api/tts` and `/api/food` get ported from Netlify functions to the droplet so alphaecho.io is self-contained. Voice recipe/allowlist copied VERBATIM.

### Build workflow (fable-asks → sonnet-build)
Fable writes one ask at a time into `docs/asks/NN-*.md` with a binary green-light; a fresh Sonnet session builds it; Fable verifies in the browser; Sam confirms green before the next ask is written. Escalation rule: two green-light failures on a unit → restart it one tier up.

| Unit | Ask | What | Model |
|------|-----|------|-------|
| U0 | 24 | Droplet provision + deploy rail: `deploy` user, Node 22, nginx, Postgres 16, certbot (alphaecho.io + www), ufw, systemd service, `ops/deploy.sh` (rsync, like planes.fun). GL: `https://alphaecho.io/api/health` 200 over TLS. | Sonnet |
| U1 | 25 | Schema + migrations (`postgres-schema` skill): users, auth tokens/sessions, workouts, assignments, workout_logs, checkins, fuel_logs, message threads, ai_drafts. Idempotent runner; seed Sam + Kyle-admin. GL: migrate twice cleanly, seed verified. | Sonnet |
| U2 | 26 | Auth + scoping (`app-auth` skill): magic-link login, cookie sessions, role middleware, every query tenant-scoped. GL: scripted IDOR test — user A cannot touch user B. | Sonnet |
| U3a | 27 | Server data API (backend only): GET /api/bootstrap, scoped writes (checkins upsert, fuel, workout-logs transaction, profile merge), one-shot POST /api/import for the prototype localStorage dump (409 if account has data). NOTE: prototype workout history is mock — import covers checkins/fuel/profile only. GL: full data test suite + 401 sweep. | Sonnet |
| U3b | 28 | Frontend server mode: build-time `VITE_SERVER_MODE` flag (droplet build only — Netlify keeps localStorage mode so the prototype never breaks); real sign-in screen (magic-link request), bootstrap hydration, all writes through the API, export button (prototype) + import flow (server mode). GL: live round-trip on alphaecho.io. | Sonnet |
| U4 | 29 | Port `/api/tts` + `/api/food` to the droplet (voice recipe + single-voice allowlist verbatim; keys only in droplet env). GL: curl 200 audio/mpeg on alphaecho.io. | Sonnet |
| U5 | 30 | Kyle console — roster + workout builder: role-gated `/coach` section; user list, per-user dashboard (readiness trend, logs, fuel), build a workout from EX_LIB and assign to a user+date. GL: assign as Kyle → appears in that user's app. | Sonnet |
| U6 | 31 | Messaging: Kyle↔user threads; user-side Kyle message cards (optional TTS), user replies; admin inbox. GL: full round-trip both directions. | Sonnet |
| U7 | 32 | AI Kyle: after a check-in/logged workout, generate a Kyle-voice reply draft via Claude API with the user's real context; console approve/edit/send; per-user auto-send toggle for routine replies. GL: log a workout → draft cites the actual numbers. | Sonnet |
| U8 | 33 | Automation (pg-boss): daily monitor (missed workouts, readiness slumps → flag + optional auto-message), weekly progress summary. GL: trigger jobs manually, verify outputs + idempotency. | Sonnet |

Then `ship-check` before any beta user beyond Sam.

### Handoff notes
- SSH: `ssh workhart` (key `~/.ssh/workhart_do`). Root now; U0 creates the `deploy` user and locks root down.
- Secrets (`ELEVENLABS_API_KEY`, `ANTHROPIC_API_KEY`, Postgres URL, email key) live ONLY in droplet env files — never in the repo, chat, or logs. Sam places them.
- Magic-link email needs a transactional provider (`transactional-email` skill) — Sam to pick/provide the key at U2.
- 2GB droplet is fine for beta-of-one; re-size before opening beta.

### Position
M0–M3 (prototype, 23 asks) live at workhart.netlify.app as of `c94ce0c` 2026-09-03.
M4: **U0 GREEN 2026-09-03** (uncommitted) — alphaecho.io live over TLS, workhart-api + Postgres 16 up, `ops/deploy.sh` idempotent.
M4: **U1 GREEN 2026-09-03** (uncommitted) — full schema (12 tables incl. `pgmigrations`) live via `node-pg-migrate` on `workhart`; idempotent seed (Sam user + Kyle admin); `workhart_test` DB + integrity tests (upsert, cross-tenant FK, cascade) all pass; `ops/deploy.sh` runs `migrate:up` before restart.
M4: **U2 GREEN 2026-09-03** (uncommitted) — magic-link auth live on alphaecho.io: Resend-delivered links (`server/mail.js`, hardcoded origin, `outbox` capture in `NODE_ENV=test`), cookie sessions + `requireUser`/`requireAdmin` (`server/authz.js`), routes `server/auth.js` (request-link/verify/logout/me, rate-limited via `express-rate-limit`), reference scoped routes `server/routes.js` (`GET /api/checkins`, `GET /api/admin/users`). App split into `server/app.js` (importable, no listen) + `server/index.js` (env fail-fast + listen) so `server/test/auth.test.js` can boot it in-process against `workhart_test`. Fixed Kyle's seed email to `hey+kyle@blueroutevineyard.com` (fix-forward migration + seed.js). All 12 tests green (8 auth incl. IDOR + rate-limit, 4 schema). Full 9-line green-light passed on alphaecho.io. Known gap: Resend account is still in sandbox mode (`onboarding@resend.dev` sender) — real send to `hey@blueroutevineyard.com` 403'd ("can only send testing emails to your own email address"); Sam needs to verify a domain in Resend (or add allowed test recipients) before the real-inbox click-through can be checked.
M4: **U3a GREEN 2026-09-03** (uncommitted) — server data API live on alphaecho.io: `server/data.js` (new router, mounted in `app.js` alongside `routes.js`) adds `GET /api/bootstrap` (profile + checkins + fuel + workoutLogs-with-nested-sets, 5 queries total, no N+1), `POST /api/checkins` (upsert on `(user_id, day)`), `POST /api/fuel-logs` + `DELETE /api/fuel-logs/:id` (owner-scoped, 404 on any other row), `POST /api/workout-logs` (single transaction: log + sets, full rollback on any bad set or cross-user `assignment_id`), `PATCH /api/profile` (whitelist-merge `bodyweight/fuelTargets/coach/device` via `profile || $1::jsonb`), and `POST /api/import` (one-shot prototype localStorage migration: 409 if the account already has any checkins/fuel rows, else one transaction mapping `kcal→calories` etc. with `Math.round`, brand folded into `raw` jsonb, skip-count for malformed entries). The 2mb json body limit for `/import` is scoped to that one route only (`app.js`'s global parser skips `/api/import` by path; `data.js` applies its own `express.json({limit:"2mb"})` there, after `requireUser`). `server/test/data.test.js`: 9 tests (bootstrap shape/no-leak, checkin upsert, fuel insert+delete+cross-user-404, workout-log transaction rollback on bad set, workout-log transaction rollback on cross-user `assignment_id`, profile merge+reject-unknown, import happy path, import-into-existing-data 409, full 401 sweep). All 21 tests green (8 auth + 4 schema + 9 data) on `workhart_test`, both locally (scratch DB `workhart_scratch_test`) and on the droplet. Full 5-line green-light passed on alphaecho.io (deploy OK, 401/404 sweep confirmed, health still `db:true`). `src/` untouched per the ask (frontend wiring is ask 28). Next: Fable writes ask 28 (U3b frontend server mode).
