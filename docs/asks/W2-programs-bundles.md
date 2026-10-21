# Ask W2 — W.2: Programs and bundles

Read `CLAUDE.md` and `docs/comps/overhaul/SPEC.md` (§0 r1, §0.1 d5, §2.2, §3, §5 W.2) first. Work on branch `overhaul` in `/Users/sm-pro/Projects/workhart`. Build ONLY this unit. Run the green-light. Report PASS/FAIL with real output and stop. Never commit, never deploy, never touch `/etc/workhart/env`, never start a dev server.

## Objective
A trainer builds workouts once, groups them into a **program** (an ordered list of days, some rest), and **enrols many clients** from a start date. Enrolment writes one assignment per client per workout day; the client app keeps reading `workout_assignments` unchanged (plus a `program_title`). Also: assign one workout to many clients on one date, and a calendar read for the trainer's week.

## Measured facts (don't re-derive)
- W.1 is deployed: `users.trainer_id` with CHECK `users_trainer_by_role`; every `/api/admin/*` query filters by `req.user.id`; `server/test/helpers.js` exports `makeTrainer(pool, label)`, `makeClient(pool, trainer, label)`, `signIn(pool, user)`, `authHeaders(cookie)`, `uniqueEmail(label)`. `server/test/admin.test.js` shows the in-process boot pattern (imports at lines 4–9, `before` blocks at 39/48, 15 tests).
- `workouts(id, created_by, title ≤120, notes, blocks jsonb, created_at, updated_at)`; `POST /admin/workouts` validates with `isValidBlocks` and stores `JSON.stringify(blocks)` (pg serialises a bare array as a Postgres array literal, not JSON — keep that).
- `workout_assignments(id, user_id, workout_id, scheduled_for date, status assigned|completed|skipped, assigned_by, created_at, UNIQUE (user_id, workout_id, scheduled_for), UNIQUE (user_id, id))`; `workout_logs (user_id, assignment_id)` composite-FKs to it.
- `server/data.js` `GET /bootstrap` (lines 72–80) selects assignments `WHERE wa.user_id = $1 AND wa.scheduled_for >= CURRENT_DATE - 7` joined to `workouts`, mapped at lines 112–125 into `{id, scheduled_for, status, workout:{id,title,notes,blocks}}`.
- Routers are mounted in `server/app.js` lines 41–46 (`app.use("/api", createXRouter(pool))`). `server/test/idor.test.js` `MATRIX` has 35 entries and two `assert.equal(..., 35)` lines; every mounted route must be listed there (the test enumerates the app's routes and compares).
- Migrations: node-pg-migrate SQL with `-- Up Migration` / `-- Down Migration`; latest `1790100000000_trainer-tenancy.sql`. Create `1790200000000_programs.sql`.
- `server/package.json` `test` script names every test file; a new file must be appended there.
- Baseline: 83/83.

## 1. Migration `server/migrations/1790200000000_programs.sql`
```sql
CREATE TABLE programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX programs_trainer_id_idx ON programs (trainer_id);
CREATE TABLE program_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES programs (id) ON DELETE CASCADE,
  day_index integer NOT NULL CHECK (day_index >= 0 AND day_index < 366),
  workout_id uuid REFERENCES workouts (id),      -- NULL = rest day
  note text,
  UNIQUE (program_id, day_index)
);
CREATE TABLE program_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES programs (id),   -- no cascade: a program with enrolments cannot be deleted
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  start_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, user_id, start_date)
);
CREATE INDEX program_enrollments_user_id_idx ON program_enrollments (user_id);
ALTER TABLE workout_assignments ADD COLUMN program_enrollment_id uuid REFERENCES program_enrollments (id) ON DELETE SET NULL;
```
Down: drop the column, then the three tables in reverse order. Top comment: why enrolments do not cascade (deleting a program must not silently erase a client's history).

## 2. New `server/programs.js` → `createProgramsRouter(pool)`, mounted in `app.js` after the admin router
All routes `requireUser, requireAdmin`. The trainer is always `req.user.id`. A client or workout that is not the trainer's own is a 404 with nothing written (validate everything before the first INSERT).
- `POST /admin/programs {title, description?, days:[{day_index, workout_id|null, note?}]}` → 201 `{id, title, description, days:[...]}`. 400 `{error:"invalid_body"}` on: title not 1–120 chars, days not an array or > 366 entries, duplicate `day_index`, `day_index` not an integer 0–365, note > 500 chars, `workout_id` not a uuid string or null. 404 if any `workout_id` is not `created_by = req.user.id`. One transaction.
- `GET /admin/programs` → `[{id, title, description, day_count, session_count (days with a workout), enrollment_count, created_at}]`, newest first.
- `GET /admin/programs/:id` → the program with `days:[{day_index, workout_id, workout_title, note}]` ordered by `day_index` and `enrollments:[{user_id, user_name, start_date}]`. 404 if not the trainer's.
- `PATCH /admin/programs/:id {title?, description?, days?}` → same validation; when `days` is present the day rows are replaced wholesale in a transaction (existing assignments from earlier enrolments are untouched). 200 with the same shape as GET.
- `DELETE /admin/programs/:id` → 204; 409 `{error:"has_enrollments"}` when any enrolment exists (catch the FK violation `23503` AND pre-check, so the response is the same either way).
- `POST /admin/programs/:id/enroll {user_ids:[uuid...], start_date:"YYYY-MM-DD"}` → validate: 1–50 ids, all distinct, every id `trainer_id = req.user.id` (else 404, nothing written), `start_date` a real date. In ONE transaction per request: for each user `INSERT INTO program_enrollments ... ON CONFLICT DO NOTHING RETURNING id`; a conflict means already enrolled from that date → counted in `skipped`; for a new enrolment, for each day with a workout `INSERT INTO workout_assignments (user_id, workout_id, scheduled_for, assigned_by, program_enrollment_id) VALUES (..., start_date + day_index, req.user.id, enrollment_id) ON CONFLICT (user_id, workout_id, scheduled_for) DO NOTHING` and count rows actually inserted. Response 200 `{enrolled:[user_id], skipped:[user_id], assignments_created:n}`.
- `POST /admin/assignments/bulk {workout_id, user_ids, scheduled_for}` → same validation style (workout must be the trainer's); `ON CONFLICT DO NOTHING`; 200 `{created:[user_id], skipped:[user_id]}`.
- `GET /admin/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` → 400 if either missing/invalid or the span exceeds 62 days or `to < from`; returns `[{id, user_id, user_name, scheduled_for, status, workout_id, workout_title, program_title|null}]` for the trainer's clients only, ordered by `scheduled_for, user_name`.

## 3. `server/data.js` (the ONE allowed change)
The bootstrap assignments select gains `program_title` via `LEFT JOIN program_enrollments pe ON pe.id = wa.program_enrollment_id LEFT JOIN programs p ON p.id = pe.program_id`, mapped as `program_title: a.program_title ?? null`. Nothing else in the file changes.

## 4. Tests — new `server/test/programs.test.js` (append to the `test` script)
Same boot pattern as `admin.test.js`, using `helpers.js`. One trainer (Kyle), one second trainer (B), three clients of Kyle, one client of B, two workouts of Kyle, one of B.
1. Create: 201 with days echoed in order; 400 on each validation case (empty title, >366 days, duplicate day_index, day_index 366, bad workout_id type); 404 when a day names B's workout and no `programs` row was written (count before/after).
2. List and get: Kyle sees his program with `day_count`/`session_count`; B's list is empty; B's GET of Kyle's id is 404.
3. Patch: title change persists; days replaced (old day rows gone, new present); B's PATCH is 404 and nothing changes.
4. Enrol: a 4-day program (days 0,1,3 workouts; day 2 rest) for 3 clients from a Monday → `enrolled` 3, `assignments_created` 9, assignments exist on Mon/Tue/Thu for each with `program_enrollment_id` set and `assigned_by` = Kyle; enrol again same date → `skipped` 3, `assignments_created` 0, total assignments still 9; enrol with B's client id in the list → 404 and no enrolment or assignment rows added; a pre-existing manual assignment of the same workout on the same day → counted as not created, no duplicate.
5. Bulk assign: 2 clients one date → `created` 2; again → `skipped` 2; B's workout id → 404.
6. Calendar: the Monday–Sunday span returns 9 rows with `program_title`; B's calendar for the same span is empty; a 70-day span is 400.
7. Delete: a program with enrolments → 409 and still present; a fresh program → 204 and gone (days gone with it).
8. Bootstrap: signed in as a client, an enrolled assignment carries `program_title`; a manual one carries `null`.
9. `idor.test.js`: add the 8 routes (`POST /api/admin/programs`, `GET /api/admin/programs`, `GET /api/admin/programs/:id`, `PATCH /api/admin/programs/:id`, `DELETE /api/admin/programs/:id`, `POST /api/admin/programs/:id/enroll`, `POST /api/admin/assignments/bulk`, `GET /api/admin/calendar`) as `access: "admin"`; both length assertions become 43.

## Hard rules
- No new npm dependencies. No change to `admin.js` beyond nothing (new routes live in `programs.js`), none to `media.js`, `media-lib.js`, `routes.js`, `ai.js`, `jobs.js`, `auth.js`, `messages.js`, or `src/`.
- Trainer id and user ids for scoping never come from the request body except as the list of clients being acted on, which is verified against `trainer_id = req.user.id` before any write.
- Every multi-row write is one transaction; a validation failure writes nothing.
- Comments: ALL CAPS on their own line above the code, saying what the code cannot say (why no cascade, why the conflict target).

## Green-light
```
cd /Users/sm-pro/Projects/workhart/server && export TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod && node node_modules/.bin/node-pg-migrate up -d TEST_DATABASE_URL      # PASS: applies 1790200000000_programs
cd /Users/sm-pro/Projects/workhart/server && export TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod && node node_modules/.bin/node-pg-migrate up -d TEST_DATABASE_URL      # PASS: "No migrations to run!"
cd /Users/sm-pro/Projects/workhart/server && export TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod && node node_modules/.bin/node-pg-migrate down -d TEST_DATABASE_URL && node node_modules/.bin/node-pg-migrate up -d TEST_DATABASE_URL   # PASS: down then up clean
cd /Users/sm-pro/Projects/workhart/server && export TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod && NODE_ENV=test node --test --test-reporter=tap test/*.test.js 2>&1 | grep -E "^# (tests|pass|fail)"   # PASS: fail 0, pass >= 95
grep -n "programs.test.js" /Users/sm-pro/Projects/workhart/server/package.json      # PASS: one line
cd /Users/sm-pro/Projects/workhart && npm run build 2>&1 | tail -1                  # PASS: "built in"
```
