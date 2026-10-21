# Ask W4 — W.4: Achievements and streaks

Read `CLAUDE.md` and `docs/comps/overhaul/SPEC.md` (§0.1 d7, d14, §2.4, §3, §5 W.4) first. Work on branch `overhaul` in `/Users/sm-pro/Projects/workhart`. Build ONLY this unit. Run the green-light. Report PASS/FAIL with real output and stop. Never commit, never deploy, never touch `/etc/workhart/env`, never start a dev server.

## Objective
A client earns achievements for real work: first session, streaks, a full week, a new personal record, a big session, a check-in streak, a finished program. One registry defines them; they are evaluated inside the same transaction as the write that could earn them; a replay never earns twice. The write responses carry what was just earned; bootstrap carries everything earned and the current streaks. Logs also take a one-tap `feel`.

## Measured facts (don't re-derive)
- `server/data.js` `POST /workout-logs` (from line 213): validates `performed_at` and `sets`, then in one transaction inserts `workout_logs` (`RETURNING id, performed_at, notes, assignment_id`), each `workout_log_sets` row (`exercise_key, set_no, reps, weight_lbs, rpe`), flips the assignment to `completed` when `assignment_id` is present, COMMITs, responds `201 { ...log, sets }`, then `setImmediate(generateDraft)`. `POST /checkins` (from line 136) validates `day`/`score`/`answers`, upserts `checkins` ON CONFLICT `(user_id, day)`, responds 200 with the row, then `setImmediate(generateDraft)`. `GET /bootstrap` responds `{user, profile, checkins, fuel, workoutLogs, assignments, unreadMessages, ...}` built from parallel queries (lines 49–130).
- Tables: `workout_logs(id, user_id, assignment_id, performed_at, notes, created_at)`; `workout_log_sets(user_id, log_id, exercise_key, set_no, reps, weight_lbs, rpe)`; `workout_assignments(id, user_id, workout_id, scheduled_for date, status assigned|completed|skipped, program_enrollment_id)`; `program_enrollments(id, program_id, user_id, start_date)`; `programs(id, title)`; `checkins(user_id, day date, score)`.
- Epley as the client uses it (`src/history.js:11`): `w * (1 + reps / 30)`; bodyweight sets (`weight_lbs` null or 0) do not count toward a PR.
- `server/test/helpers.js`: `makeTrainer`, `makeClient`, `signIn`, `authHeaders`, `uniqueEmail`. `server/test/data.test.js` already tests both write routes (boot pattern there). `idor.test.js` MATRIX has 44 entries (no new route in this unit). `server/package.json` `test` script names every test file.
- Migrations: latest `1790300000000_coach-lines.sql`. Create `1790400000000_achievements.sql`.
- Baseline: 98/98.

## 1. Migration `server/migrations/1790400000000_achievements.sql`
```sql
CREATE TABLE user_achievements (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  achievement_id text NOT NULL,
  dedupe_key text NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  context jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (user_id, achievement_id, dedupe_key)
);
ALTER TABLE workout_logs ADD COLUMN feel text CHECK (feel IN ('easy', 'right', 'hard'));
```
Down: drop the column, drop the table. Top comment: the primary key is the idempotency (a replayed write cannot earn twice); `achievement_id` is validated by the code registry, not a CHECK, so adding an achievement is a code change only.

## 2. New `server/streaks.js` (pure, no DB)
- `export function sessionStreak(assignments, today)` — `assignments`: `[{scheduled_for: 'YYYY-MM-DD', status}]` (any order); `today`: `'YYYY-MM-DD'`. Take the distinct scheduled days `<= today`, sorted descending; walk from the most recent: a day counts when every assignment on it is `completed`; stop at the first day that is not (an `assigned` day in the past breaks it; `skipped` breaks it). Return the count. A day `> today` is ignored. No assignments → 0.
- `export function checkinStreak(days, today)` — `days`: array of `'YYYY-MM-DD'`; count consecutive calendar days ending at `today` that have a check-in (today itself must be present for a non-zero result).
- `export function isoWeekKey(dateStr)` → `'YYYY-Www'` (ISO-8601, the same nearest-Thursday rule `server/jobs.js` `isoWeekInfo` uses; reuse it by import if it is exported, else reimplement and test against 2026-01-01 = `2026-W01`, 2027-01-01 = `2026-W53`).
- `export function epley(weightLbs, reps)` → `weightLbs * (1 + reps / 30)`; null/0 weight → 0.

## 3. New `server/achievements.js` (the one registry)
`export const ACHIEVEMENTS = [...]`, each `{ id, title, blurb, dedupe(ctx), evaluate(ctx) }` where `ctx` is `{ kind: 'workout_log' | 'checkin', today, log?: {id, assignment_id, sets:[{exercise_key, reps, weight_lbs}]}, assignment?: {id, scheduled_for, program_enrollment_id}, assignments: [...all of the user's], priorBest: Map<exercise_key, number> (best Epley before this log), logCount: number (including this one), checkinDays: [...], enrollment?: {id, total, completed} }`. `evaluate` returns `true` or `false`; `dedupe` returns the key. The eight:
| id | title | blurb | dedupe | earns when |
|---|---|---|---|---|
| `first_session` | First session | You showed up. That is the whole game. | `'once'` | `logCount === 1` |
| `streak_3` | Three straight | Three assigned days in a row, done. | `'once'` | `sessionStreak >= 3` |
| `streak_7` | Seven straight | A full week without a miss. | `'once'` | `sessionStreak >= 7` |
| `week_complete` | Week complete | Every session Kyle set this week. | the ISO week key of `assignment.scheduled_for` | the log has an assignment and every assignment in that ISO week with `scheduled_for <= today` is `completed` and there are at least 2 |
| `new_pr` | New record | A new best on `<exercise>`. | the exercise key | any set's Epley (weight > 0) beats `priorBest` for that exercise, which must exist (a first-ever lift is not a PR) |
| `volume_10k` | Ten thousand | 10,000 lb moved in one session. | `'once'` | Σ reps × weight over this log's sets `>= 10000` |
| `checkin_streak_7` | Seven mornings | Checked in seven days running. | `'once'` | `checkinStreak >= 7` |
| `program_complete` | Program complete | Every day of `<program>`, done. | the enrollment id | the log's assignment has an enrollment and `enrollment.completed === enrollment.total` |
`export async function evaluateAndRecord(client, userId, ctx)` → runs every rule with try/catch per rule (a throwing rule logs `achievement <id> error: <message>` and is skipped, never failing the write), inserts `user_achievements` rows with `ON CONFLICT DO NOTHING RETURNING achievement_id, dedupe_key`, and returns `earned: [{id, title, blurb, context}]` for the rows actually inserted (context: `{exercise}` for `new_pr`, `{week}` for `week_complete`, `{program}` for `program_complete`, else `{}`).
`export async function loadContext(client, userId, { kind, logId, assignmentId, today })` builds `ctx` with these reads (all `user_id = $1`): assignments (`id, scheduled_for::text, status, program_enrollment_id`), this log's sets, `priorBest` from every set of this user whose `log_id <> $logId` (Epley max per exercise, weight > 0), `logCount = COUNT(*) FROM workout_logs`, check-in days (`day::text` ordered), and for the assignment's enrollment `total = COUNT(*)` and `completed = COUNT(*) FILTER (WHERE status='completed')` over `workout_assignments WHERE program_enrollment_id = $enrollment` plus the program title.

## 4. `server/data.js`
- `POST /workout-logs`: accept optional `feel` (`'easy'|'right'|'hard'|null`, else 400 `{error:"invalid feel"}`); store it; after the assignment flip and BEFORE `COMMIT`, `const ctx = await loadContext(client, req.user.id, { kind:'workout_log', logId: log.id, assignmentId: assignment_id ?? null, today })` then `const earned = await evaluateAndRecord(client, req.user.id, ctx)`; respond `201 { ...log, feel, sets, earned }`. `today` = the server's current date (`CURRENT_DATE::text` read inside the transaction).
- `POST /checkins`: wrap the upsert in a transaction (BEGIN/COMMIT with a `pool.connect()` client), evaluate with `kind:'checkin'` after the upsert, respond `200 { ...row, earned }`.
- `GET /bootstrap`: add `achievements: [{id, title, blurb, dedupe_key, earned_at, context}]` (joined to the registry for title/blurb; rows whose id is not in the registry are dropped) and `streaks: { session, checkin }` computed with `streaks.js` from the already-loaded assignments and check-ins (`today` = server date). The bootstrap assignments query currently starts at `CURRENT_DATE - 7`; the streak needs the full assignment history, so add one more query for `scheduled_for::text, status` over all of the user's assignments (do not widen the existing one).
- `GET /workout-logs`-shaped reads (`workoutLogs` in bootstrap) include `feel`.

## 5. Tests — new `server/test/achievements.test.js` (append to the `test` script)
1. Pure: `sessionStreak` (3 completed days → 3; a skipped day in the middle → the count above it; a future assigned day ignored; today assigned-not-completed → 0); `checkinStreak` (7 consecutive ending today → 7; a gap → the run since the gap; today missing → 0); `isoWeekKey` on 2026-01-01 and 2027-01-01; `epley(185,5)` = 215.83 within 0.01, `epley(null,8)` = 0.
2. First log → `earned` contains `first_session`; a second log does not.
3. A 3-day program enrolled from three days ago, logs on each of the three assignments → the third response's `earned` contains `streak_3` and `program_complete` (context.program = the title) and `week_complete` when the three days share an ISO week (choose dates that do); replaying the third `POST /workout-logs` body (a new log row) earns nothing new and `user_achievements` count is unchanged.
4. PR: log squat 175 × 5, then 185 × 5 → second earns `new_pr` with `context.exercise`; then 185 × 5 again → nothing; the first lift ever earned no `new_pr`.
5. Volume: one log with sets totalling ≥ 10,000 lb → `volume_10k`; a 9,000 lb log → not.
6. Check-ins on 7 consecutive days ending today (upsert each) → the seventh earns `checkin_streak_7`; re-posting today's check-in earns nothing.
7. `feel`: `'hard'` stored and returned; `'meh'` → 400 and no log row.
8. Bootstrap: `achievements` lists the earned rows with titles; `streaks.session` and `streaks.checkin` match the fixtures; `workoutLogs[].feel` present.
9. A rule that throws (monkey-patch one registry entry's `evaluate` to throw inside the test, restore in `finally`) → the log still 201s and the other rules still earn.
10. Tenancy: client B's bootstrap shows none of A's achievements.
Existing `data.test.js` assertions must keep passing (the `201` body gains `feel` and `earned`; the check-in `200` body gains `earned`).

## Hard rules
- No new npm dependencies. No change to `admin.js`, `programs.js`, `coach.js`, `ai.js`, `media*.js`, `messages.js`, `auth.js`, `routes.js`, `jobs.js` (except importing `isoWeekInfo` if exported), or `src/`.
- Achievements are earned only inside the write's transaction; the client never computes them.
- A rule failure never fails the write.
- Comments: ALL CAPS on their own line above the code (why the PK is the idempotency; why `today` comes from the DB clock).

## Green-light
```
cd /Users/sm-pro/Projects/workhart/server && export TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod && node node_modules/.bin/node-pg-migrate up -d TEST_DATABASE_URL      # PASS: applies 1790400000000_achievements
cd /Users/sm-pro/Projects/workhart/server && export TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod && node node_modules/.bin/node-pg-migrate up -d TEST_DATABASE_URL      # PASS: "No migrations to run!"
cd /Users/sm-pro/Projects/workhart/server && export TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod && node node_modules/.bin/node-pg-migrate down -d TEST_DATABASE_URL && node node_modules/.bin/node-pg-migrate up -d TEST_DATABASE_URL   # PASS: down then up clean
cd /Users/sm-pro/Projects/workhart/server && export TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod && NODE_ENV=test node --test --test-reporter=tap test/*.test.js 2>&1 | grep -E "^# (tests|pass|fail)"   # PASS: fail 0, pass >= 108
grep -c "achievements.test.js" /Users/sm-pro/Projects/workhart/server/package.json     # PASS: 1
cd /Users/sm-pro/Projects/workhart && npm run build 2>&1 | tail -1                      # PASS: "built in"
```
