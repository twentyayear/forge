# Ask 34 — U8: Automation (pg-boss daily monitor + weekly summary)

## Objective
Background work so Kyle doesn't have to notice things manually:
1. **Daily monitor** — per athlete: missed assigned workouts and readiness slumps → a Kyle message (auto-sent if that athlete has auto-send on, otherwise a pending draft for the console).
2. **Weekly summary** — per athlete: a Kyle-voice recap of the week's real numbers, same send/draft rule.

Read `CLAUDE.md` first; hard rules apply (never print secrets, commit nothing, no deletes). Also follow Sam's `jobs-and-queues` skill: idempotent by construction, explicit failure paths, one-line run summaries, no tight loops.

## Measured facts (don't re-derive)
- Stack decision (PRD): **pg-boss**, never Temporal. Droplet is UTC; Sam is ET.
- `server/ai.js` exists (ask 33): `createDraftGenerator(pool)` → `generateDraft({userId, triggerType, triggerId})`, plus internal `callClaude(userContent, context)` and `buildContext(...)`, and the `calls` / `testControls` test seam. `ai_drafts.trigger_type` allows `'checkin' | 'workout_log' | 'manual'` — automation uses **`'manual'`**; no CHECK change needed.
- Auto-send flag: `users.profile.kyleAutoSend === true` (admin-set only; athlete PATCH whitelist can't reach it).
- `server/app.js` is imported by every test — **pg-boss must NOT start there.** Start it in `server/index.js` only, and never when `NODE_ENV === 'test'`.
- `ops/deploy.sh` runs `migrate:up` then restarts the single `workhart-api` systemd service.
- Two authorized new deps this unit: **`pg-boss`** only (nothing else).

## 1. Schema (ONE new migration — the only schema change authorized)
`job_runs` — the idempotency marker table (the skill's "processed-marker" pattern):
```sql
CREATE TABLE job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  dedupe_key text NOT NULL,
  user_id uuid REFERENCES users (id) ON DELETE CASCADE,
  result jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_name, dedupe_key)
);
```
Include a Down migration. Migration must be re-runnable (`migrate:up` twice clean).

## 2. `server/jobs.js` — handlers, testable WITHOUT pg-boss
Export the handlers as plain functions taking `(pool, deps, { now })` so tests call them directly; pg-boss wiring is separate (§3). `deps` carries the draft generator (injectable fake in tests).

**`runDailyMonitor`** — for every user with role `'user'`:
- **Claim the day first:** `INSERT INTO job_runs (job_name,dedupe_key,user_id) VALUES ('daily-monitor', '<user_id>:<YYYY-MM-DD>', ...) ON CONFLICT DO NOTHING`. `rowCount === 0` → already ran today, skip that user entirely. This is the idempotency guarantee — a second run the same day changes nothing.
- Findings: (a) **missed workout** — assignments with `scheduled_for < today` AND `status = 'assigned'`, limited to the last 7 days; (b) **readiness slump** — the athlete has ≥3 checkins and the mean of their last 3 scores is ≥15 points below the mean of the 7 days before that, or below 50 outright.
- No findings → record `result` `{findings: []}` and stop (no message — silence is correct; do NOT send "nothing to report" mail).
- Findings → one Kyle message covering them (not one per finding), via §4. Record counts in `result`.

**`runWeeklySummary`** — for every user with role `'user'`:
- Claim with dedupe_key `'<user_id>:<ISO year>-W<ISO week>'` (compute ISO week properly; a helper + its own test).
- Context = last 7 days: assignments completed vs assigned, checkin count + mean score, workout logs + total volume (Σ reps × weight_lbs), fuel days logged. Skip a user with zero activity all week (record `{skipped:'no activity'}`) — no empty recaps.
- Otherwise one Kyle-voice recap via §4.

Both handlers: wrap per-user work in try/catch so **one athlete's failure never aborts the others**; collect errors into the summary. Return `{users, acted, skipped, errors}`.

## 3. pg-boss wiring (`server/scheduler.js`, started only from `index.js`)
- `new PgBoss(process.env.DATABASE_URL)`, `await boss.start()` (it creates its own schema).
- Schedules: `daily-monitor` at `0 13 * * *`, `weekly-summary` at `30 13 * * 1` (UTC — 9:00/9:30am ET; note the DST caveat in a comment, don't solve it).
- Register workers with `retryLimit: 2, retryBackoff: true`. On final failure pg-boss marks the job failed — log ONE line (`job daily-monitor failed: <message>`), never payloads or secrets.
- Use pg-boss singleton/queue policy so two runs of the same schedule can't overlap.
- Every completed run logs one line: `job <name> ok: users=N acted=N skipped=N errors=N (Nms)`.
- Boot must not hard-fail if pg-boss can't start — log one line and let the API keep serving.

## 4. Message/draft path (small `server/ai.js` addition)
Add an exported `generateFromContext(pool, {userId, kind, context, triggerId})` that reuses the existing `callClaude` + system prompt (Kyle's voice, cites real numbers, 2–4 sentences) with a `kind`-specific instruction (`'monitor'` vs `'weekly'`), then applies the SAME auto-send rule as ask 33: `profile.kyleAutoSend` true → insert the `messages` row (`sender 'kyle'`, `ai_generated true`) + `ai_drafts` row `status 'sent'` with `sent_message_id`, in one transaction; else insert a `pending` draft (`trigger_type 'manual'`). Do not change `generateDraft`'s existing behavior or signature.

## 5. Manual trigger (admin route)
`POST /api/admin/jobs/:name/run` (requireAdmin, names limited to `daily-monitor` | `weekly-summary`; anything else 404) → runs the handler inline and returns the summary object. This is what the green-light drives, and how Kyle re-runs after a failure.

## 6. Tests (`server/test/jobs.test.js`, fake generator — no pg-boss, no Claude API)
1. ISO-week helper: correct across a year boundary.
2. Daily monitor with a seeded missed assignment → one message/draft; **run again → zero new rows** (double-run idempotency).
3. Daily monitor, readiness slump seeded → detected; athlete with steady scores → no finding, no message.
4. Athlete with no findings → `job_runs` row written, no draft.
5. Weekly summary: active athlete → recap draft citing counts; zero-activity athlete → skipped, no draft.
6. Weekly summary double-run in the same ISO week → zero new rows.
7. One athlete's generator throwing → other athletes still processed, `errors: 1` in the summary.
8. Admin route: 401 no session, 404 non-admin, 404 unknown job name, 200 + summary as admin.

## Hard rules
- Frontend: **no `src/` changes at all** this unit.
- `pg-boss` is the only new dep. Only one migration. No commits.
- Never send an empty/"no news" message — silence when there's nothing to say.
- Prod DB gets the migration via deploy; live green-light drives the admin route with the test athletes only (`hey+gl@`), never Sam's account.

## Green-light (run each, report PASS/FAIL with actual output)
```
ssh workhart 'cd /srv/workhart/server && npm run migrate:up && npm run migrate:up'   # twice, second is a no-op
ssh workhart 'cd /srv/workhart/server && npm test'                                   # all suites (48 + new) — report counts
./ops/deploy.sh                                                                      # green end-to-end
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://alphaecho.io/api/admin/jobs/daily-monitor/run   # 401
# As Kyle (mint-link → cookie jar), against the test athlete only:
#  1. psql: give hey+gl a missed assignment (scheduled_for = yesterday, status 'assigned')
#  2. POST /api/admin/jobs/daily-monitor/run  → summary shows acted>=1; Drafts queue has a new pending draft QUOTING the missed workout
#  3. POST the SAME endpoint again → summary shows skipped (already ran today); psql: ai_drafts count UNCHANGED   [double-run]
#  4. POST /api/admin/jobs/weekly-summary/run → recap draft citing real weekly counts; run again → unchanged      [double-run]
#  5. Dead-letter/failure path: temporarily point the generator at a forced failure (testControls or an env-less path) and confirm
#     the run returns errors>=1, the other athletes still processed, and ONE log line appears with no payload/secret   [poison item]
#  6. journalctl: confirm the scheduler started at boot and logged its one-line summary format
ssh workhart 'sudo -u postgres psql workhart -tAc "SELECT job_name, dedupe_key, result FROM job_runs ORDER BY created_at"'   # markers correct
curl -s https://alphaecho.io/api/health                                              # still ok, db true
```
Report every line PASS/FAIL with actual output, then stop.
