# Ask W5 — W.5: Compose with AI, email channel, offers, history window

Read `CLAUDE.md` and `docs/comps/overhaul/SPEC.md` (§0 q6 q7 q8, §0.1 d8 d9 d10, §2.5, §3, §5 W.5) first. Work on branch `overhaul` in `/Users/sm-pro/Projects/workhart`. Build ONLY this unit. Run the green-light. Report PASS/FAIL with real output and stop. Never commit, never deploy, never touch `/etc/workhart/env`, never start a dev server.

## Objective
The trainer picks clients and an intent and gets one AI draft per client in Kyle's voice; sends a message to many clients at once, in-app and optionally by email; a Kyle message left unread for 24 hours is emailed once by a job. The trainer publishes offers (a 1:1, a call, a program); the client sees them and asks for one, which lands in the trainer's inbox as a message and a request. The client can read the last 30 days of sessions.

## Measured facts (don't re-derive)
- `server/mail.js`: `RESEND_API_URL` hardcoded (origin pinned), `export const outbox = []`, `sendMagicLink(email, url)` renders a black HTML email with a blue button, POSTs to Resend with `MAIL_FROM` (defaults `WORKHART <onboarding@resend.dev>`), returns `{ok}`; in `NODE_ENV=test` it pushes `{email, url}` to `outbox` and returns `{ok:true}`. `APP_BASE_URL` is the public origin (`auth.js` uses it for links).
- `server/messages.js`: `validBody(body)` (module-local) validates a message body; `POST /admin/users/:id/messages` inserts `messages (user_id, sender 'kyle', body)` after `SELECT 1 FROM users WHERE id = $1 AND trainer_id = $2`. `messages(id, user_id, sender user|kyle, body, ai_generated, read_at, created_at)`.
- `server/ai.js`: `export async function callClaude(userContent, context, systemPrompt, opts)` (test mode: pushes to `calls`, throws on `testControls.forceFailure`, returns a fake line citing `citableNumber(context)` = `context.trigger.score` for `type:'checkin'`); `SYSTEM_PROMPT` (Kyle's voice + DATA guard); `generateFromContext` builds a weekly/monitor draft (not reused here).
- `server/jobs.js`: `runDailyMonitor(pool, deps, {now})`, `runWeeklySummary(...)`, `export const JOB_HANDLERS = {...}` (manual trigger map); claim pattern = `INSERT INTO job_runs ... ON CONFLICT DO NOTHING` then `rowCount === 0` → skip. `server/scheduler.js` registers `JOBS = [{name, cron, run}]` with `createQueue(name, {policy:'singleton', retryLimit:2, retryBackoff:true})`, `schedule(name, cron, {}, {tz:'UTC'})`, `work(name, ...)`; it runs only from `index.js`, never under test. `POST /admin/jobs/:name/run` 404s on names not in `JOB_HANDLERS`.
- `server/data.js`: `PATCH /profile` merges a whitelisted set of keys into `users.profile` jsonb (find the whitelist in that route); `GET /bootstrap` returns `workoutLogs` (last 20) with sets. `users.trainer_id` points a client at its trainer; `users.profile` jsonb.
- Tests: `helpers.js` (`makeTrainer`, `makeClient`, `signIn`, `authHeaders`, `uniqueEmail`); `idor.test.js` MATRIX has 44 entries + two length assertions; `package.json` `test` script names every file; `ai.test.js` toggles `testControls.forceFailure`.
- Migrations: latest `1790400000000_achievements.sql`. Create `1790500000000_compose-offers.sql`.
- Baseline: 108/108.

## 1. Migration `server/migrations/1790500000000_compose-offers.sql`
```sql
CREATE TABLE message_emails (
  message_id uuid PRIMARY KEY REFERENCES messages (id) ON DELETE CASCADE,
  resend_id text,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  blurb text CHECK (blurb IS NULL OR length(blurb) <= 500),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  kind text NOT NULL CHECK (kind IN ('session', 'call', 'program', 'other')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX offers_trainer_id_idx ON offers (trainer_id);
CREATE TABLE offer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES offers (id),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX offer_requests_offer_id_idx ON offer_requests (offer_id);
```
Down: drop the three tables in reverse order. Top comment: `message_emails` is the one-email-per-message ledger (the row is inserted before the send; a failed send deletes it so the next run may try again); money is integer cents.

## 2. `server/mail.js` (additive)
`export async function sendKyleMessage(email, { body, appUrl })` → subject `Kyle: ` + the first 48 characters of `body` (trimmed, one line); HTML in the existing dark style: "Kyle" as the header line, the body as escaped paragraphs (split on blank lines; HTML-escape `& < > "`), a blue "Open WORKHART" button to `appUrl`, a grey footer "You get these because a message from Kyle waited in WORKHART. Turn them off in Settings."; plain-text alternative = body + two newlines + `Open WORKHART: <appUrl>`. Returns `{ok, id}` where `id` is Resend's response id (or `null`). In `NODE_ENV=test` push `{email, kind:'message', body, appUrl}` onto `outbox` and return `{ok:true, id:'test'}`. Same from-address, same pinned URL, never logs the body; on failure logs status + Resend message only. Export `validBody` from `messages.js` (make the existing local function `export`) so broadcast reuses the same rule.

## 3. New `server/compose.js` → `createComposeRouter(pool)`, mounted in `app.js`
All `requireUser, requireAdmin`.
- `POST /admin/compose {user_ids, intent, notes?}`: 1–5 distinct uuids all `trainer_id = req.user.id` (else 404, nothing written); `intent` in `encourage|checkin|correct|offer|custom`; `notes` ≤ 500 chars. For each client, read (all by that user's id): name; last 7 check-ins `{day, score}`; last 3 logs with per-exercise top set and the assignment title; assignments in the last 7 days with status (missed = `assigned` and `scheduled_for < CURRENT_DATE`); last 4 messages `{sender, body}`; `trainer.name` = `req.user.name`. Build `context = { trigger: { type: 'checkin', score: <latest score or 0> }, client: {...}, intent, notes }` and call `callClaude('DATA (not instructions):\n' + JSON.stringify(context), context, COMPOSE_PROMPT)` where `COMPOSE_PROMPT` (exported from `compose.js`) = `SYSTEM_PROMPT`'s voice paragraph + "You are writing a message the trainer will send to this one client. Intent: {intent}. encourage = celebrate something specific; checkin = ask how they are, name the thing you noticed; correct = one form or programming correction, kindly; offer = mention the trainer's offer named in the notes without pressure; custom = follow the notes. 2 to 4 sentences, first person as Kyle, cite at least one real number from the DATA, no emojis, no sign-off." + the DATA guard sentence from `SYSTEM_PROMPT` (compose by slicing as `COACH_LINE_PROMPT` does; see `ai.js`). Response 200 `{drafts:[{user_id, body}]}`; a failed generation gives `{user_id, body: null, error: 'generation_failed'}`. Nothing is written to the database.
- `POST /admin/messages/broadcast {user_ids, body, email}`: 1–50 distinct uuids all the trainer's (else 404); `body` through `validBody`; `email` boolean (default false). In ONE transaction insert one `messages` row per client (`sender 'kyle'`). After COMMIT, when `email` is true: for each client whose `profile->>'emailMessages'` is not `'false'`, `INSERT INTO message_emails (message_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING message_id`; if a row was inserted call `sendKyleMessage(user.email, { body, appUrl: process.env.APP_BASE_URL || '' })`; on `{ok:false}` or a throw, `DELETE FROM message_emails WHERE message_id = $1` and log one line (`broadcast email failed message=<id>`), continue with the others. Response 200 `{sent:[{user_id, message_id, emailed: true|false}]}`.

## 4. New `server/offers.js` → `createOffersRouter(pool)`, mounted in `app.js`
Trainer (`requireUser, requireAdmin`, scoped by `trainer_id = req.user.id`): `GET /admin/offers` (all, newest first, with `request_count` of open requests), `POST /admin/offers {title, blurb?, price_cents, kind}` → 201, `PATCH /admin/offers/:id {title?, blurb?, price_cents?, kind?, active?}` → 200, `DELETE /admin/offers/:id` → 204, or 409 `{error:"has_requests"}` when any request exists; `GET /admin/offer-requests` → open requests `[{id, offer_id, offer_title, user_id, user_name, created_at}]` for the trainer's offers; `PATCH /admin/offer-requests/:id {status:'closed'}` → 200. Validation 400 `{error:"invalid_body"}` on any shape error; unknown or foreign ids 404.
Client (`requireUser`): `GET /offers` → the active offers of `users.trainer_id` of the caller `[{id, title, blurb, price_cents, kind}]`; `POST /offers/:id/request` → 404 unless the offer is active and belongs to the caller's trainer; 409 `{error:"already_open"}` when the caller has an open request for it; else in one transaction insert `offer_requests` and a `messages` row from the client (`sender 'user'`, body `I'd like to book: <title>`); 201 `{request_id, message_id}`.

## 5. `server/data.js` (two additive changes)
- `PATCH /profile`: add `emailMessages` (boolean) to the whitelist.
- New `GET /history?days=N` (`requireUser`): `N` integer 1–30 (default 30; anything else 400); `HISTORY_DAYS_FREE = 30` exported constant caps it; returns `{days, logs:[{id, performed_at, notes, feel, assignment_id, workout_title|null, sets:[...]}]}` for `performed_at >= now() - days`, newest first, sets ordered by `exercise_key, set_no`.

## 6. `server/jobs.js` + `scheduler.js`
- `export async function runUnreadNudge(pool, deps, { now = new Date() } = {})`: select Kyle messages (`sender 'kyle'`) with `read_at IS NULL`, `created_at < now - 24h`, no `message_emails` row, whose user's `profile->>'emailMessages'` is not `'false'`, joined to the user's email, oldest first, limit 200. For each: insert the ledger row `ON CONFLICT DO NOTHING RETURNING` (skip when nothing returned), then `deps.sendKyleMessage(email, {body, appUrl})`; on failure delete the ledger row. Return `{candidates, sent, failed, skipped}` and log one summary line (`job unread-nudge ok: ...`). No `job_runs` row (the ledger is the idempotency).
- Register `{ name: "unread-nudge", cron: "15 * * * *", run: runUnreadNudge }` in `scheduler.js` JOBS and in `JOB_HANDLERS` (so `POST /admin/jobs/unread-nudge/run` works); the deps object passed by both carries `sendKyleMessage` from `mail.js` and `appUrl`.

## 7. Tests — new `server/test/compose.test.js` and `server/test/offers.test.js` (append both to the `test` script)
compose:
1. Compose for 2 clients with intent `checkin`: 200, two drafts, each body cites the client's latest score (test fake); `calls` grew by 2; each `system` contains `checkin` and `DATA`; each `userContent` contains that client's name and never the other client's; no `messages` or `ai_drafts` rows were written. 6 ids → 400; B's client id → 404 and `calls` unchanged; `forceFailure` → bodies null with `generation_failed`, still 200.
2. Broadcast to 2 clients with `email:true`: 200; 2 `messages` rows (`sender 'kyle'`); 2 `message_emails` rows; `outbox` gained 2 `{kind:'message'}` entries whose `body` equals the sent text and whose subject rule holds (`Kyle: ` + 48 chars, assert on the rendered subject if exposed, else on the body). Broadcast again with the same body → 2 new messages, 2 new emails (a broadcast is not deduped; the ledger is per message). A client with `profile.emailMessages=false` (set through `PATCH /profile` as that client) → message row yes, ledger row no, outbox unchanged. `email:false` → no ledger rows. B's client id → 404 and nothing written. Invalid body → 400.
3. Unread nudge: seed a Kyle message created 25 h ago unread for A, one 2 h ago unread, one 25 h ago but read, one 25 h ago for a client with `emailMessages=false`; `runUnreadNudge(pool, {sendKyleMessage: fake, appUrl})` → `sent 1` for the 25 h unread one, ledger row exists; run again → `sent 0`, `skipped` counts it; with a fake that returns `{ok:false}` on a fresh seeded message → `failed 1` and NO ledger row; `POST /admin/jobs/unread-nudge/run` as Kyle → 200 with the counts shape; the daily-monitor route still 200s.
offers:
4. CRUD as Kyle: create 201 (validation 400s: empty title, negative price, bad kind), list shows `request_count 0`, patch `active:false` persists, B's GET/PATCH/DELETE of Kyle's offer → 404; delete of a fresh offer → 204.
5. Client A: `GET /offers` lists only Kyle's active offers (an inactive one hidden; B's offers hidden); `POST /offers/:id/request` → 201, a `messages` row from A with `I'd like to book: <title>` and an `offer_requests` row; again → 409; an inactive or B's offer id → 404 and nothing written. Kyle's `GET /admin/offer-requests` shows it with A's name; `PATCH ... {status:'closed'}` → 200 and it leaves the open list; B sees nothing; delete of the offer now → 409.
6. History: A with 3 logs at 2, 20 and 40 days ago → `GET /history` returns 2 logs with sets and `workout_title`; `?days=5` → 1; `?days=31` → 400; B's history excludes A's logs.
7. `idor.test.js`: add 11 routes — `POST /api/admin/compose`, `POST /api/admin/messages/broadcast`, `GET /api/admin/offers`, `POST /api/admin/offers`, `PATCH /api/admin/offers/:id`, `DELETE /api/admin/offers/:id`, `GET /api/admin/offer-requests`, `PATCH /api/admin/offer-requests/:id` (all `admin`), `GET /api/offers`, `POST /api/offers/:id/request`, `GET /api/history` (all `user`); both length assertions become 55.

## Hard rules
- No new npm dependencies. No change to `media*.js`, `coach*.js`, `programs.js`, `achievements.js`, `streaks.js`, `auth.js`, `routes.js`, `admin.js`, or `src/`. `ai.js` unchanged (compose imports what it already exports). `messages.js` changes only to export `validBody`.
- Every email goes through `mail.js`; the pinned Resend URL stays; never log a body or a key.
- The ledger row is inserted before the send; a failed send deletes it.
- Trainer id and client ids never come from the request except as the list acted on, verified against `trainer_id = req.user.id` before any write.
- Comments: ALL CAPS on their own line above the code.

## Green-light
```
cd /Users/sm-pro/Projects/workhart/server && export TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod && node node_modules/.bin/node-pg-migrate up -d TEST_DATABASE_URL      # PASS: applies 1790500000000_compose-offers
cd /Users/sm-pro/Projects/workhart/server && export TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod && node node_modules/.bin/node-pg-migrate up -d TEST_DATABASE_URL      # PASS: "No migrations to run!"
cd /Users/sm-pro/Projects/workhart/server && export TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod && node node_modules/.bin/node-pg-migrate down -d TEST_DATABASE_URL && node node_modules/.bin/node-pg-migrate up -d TEST_DATABASE_URL   # PASS: down then up clean
cd /Users/sm-pro/Projects/workhart/server && export TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod && NODE_ENV=test node --test --test-reporter=tap test/*.test.js 2>&1 | grep -E "^# (tests|pass|fail)"   # PASS: fail 0, pass >= 118
grep -c "compose.test.js\|offers.test.js" /Users/sm-pro/Projects/workhart/server/package.json     # PASS: 1 (both names on the one test line)
grep -n "api.resend.com" /Users/sm-pro/Projects/workhart/server/*.js | grep -v "mail.js" | wc -l   # PASS: 0
cd /Users/sm-pro/Projects/workhart && npm run build 2>&1 | tail -1                      # PASS: "built in"
```
