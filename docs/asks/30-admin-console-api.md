# Ask 30 — U5a: Kyle console API (backend only)

## Objective
The admin endpoints the Kyle console (ask 31) will run on: roster, per-user overview, workout creation, assignment — plus `assignments` added to the user-side bootstrap so an assigned workout can appear in the athlete's app. Backend only — nothing under `src/` changes. Read `CLAUDE.md` first; hard rules apply (never print secrets, commit nothing, no deletes).

Copy the authz pattern from `server/routes.js`/`server/authz.js`: admin routes use `requireAdmin` (which 404s to non-admins — keep that); the TARGET user id comes from the URL param on admin routes only, and is always validated to exist. User-side routes keep `req.user.id` scoping — never from request input.

## Measured facts (don't re-derive)
- Schema (migrations/1788466285281): `workouts` (id uuid, created_by → users, title NOT NULL, notes, blocks jsonb default `[]`); `workout_assignments` (user_id, workout_id, scheduled_for date, status assigned|completed|skipped, assigned_by, UNIQUE(user_id,workout_id,scheduled_for), UNIQUE(user_id,id) as the composite-FK target for workout_logs).
- Blocks jsonb shape (established in ask 25, the frontend will build these from EX_LIB): `[{exercise_key, sets: [{reps, weight_lbs?, rpe?}], rest_sec?, note?}]`.
- `GET /api/admin/users` already exists (U2 reference route). `GET /api/bootstrap` (server/data.js) currently returns user/profile/checkins/fuel/workoutLogs.

## 1. Admin routes (new `server/admin.js` mounted in `app.js`, ALL requireAdmin)
- `GET /api/admin/users` — MOVE here from routes.js (don't duplicate; keep behavior) and extend each row with `last_checkin` (max day) and `assignment_count`. One query, no N+1.
- `GET /api/admin/users/:id/overview` → 404 if no such user; else `{user: {id,email,name,role}, profile, checkins (all, day asc), fuel (last 30 by eaten_on desc), workoutLogs (last 20 with nested sets, performed_at desc), assignments (all upcoming + last 10 past, with workout title joined)}`. Reuse the query shapes from `/api/bootstrap` — same no-N+1 rule.
- `POST /api/admin/workouts` `{title, notes?, blocks}` → validate title non-empty ≤120 chars, blocks is an array where every entry has a non-empty string `exercise_key` and a non-empty `sets` array of `{reps: int ≥1, weight_lbs?: number ≥0, rpe?: number 1–10}` (reject anything else, 400 generic). `created_by = req.user.id`. Returns the row.
- `GET /api/admin/workouts` → all workouts (id, title, notes, blocks, created_at desc) — the console's "reuse a workout" list.
- `POST /api/admin/assignments` `{user_id, workout_id, scheduled_for}` → validate the user exists (404), the workout exists (404), `scheduled_for` is YYYY-MM-DD; `assigned_by = req.user.id`. Duplicate (same user+workout+date) → 409. Returns the row.
- `PATCH /api/admin/assignments/:id` `{status}` → only `status` changes allowed (assigned|skipped only — `completed` is reserved for the athlete's logging flow later; reject it 400 here). 404 if not found.

## 2. Bootstrap addition (server/data.js)
`GET /api/bootstrap` gains `assignments`: the session user's assignments from 7 days ago forward (scheduled_for ≥ CURRENT_DATE - 7, asc), each with the workout joined: `{id, scheduled_for, status, workout: {id, title, notes, blocks}}`. Existing fields unchanged (additive only — U3b's frontend must keep working untouched).

## 3. Tests (`server/test/admin.test.js`, same boot pattern; extend data.test.js ONLY for the bootstrap addition)
1. Every admin route 404s for a non-admin session and 401s with no session (sweep).
2. Roster returns all users with last_checkin/assignment_count correct.
3. Overview 404 on unknown user id; correct shape + only that user's rows for a real one.
4. Workout create: happy path; 400 on empty title, empty blocks entry, set with reps 0, unknown extra shape.
5. Assignment: happy path; 404 unknown user; 404 unknown workout; 409 duplicate; PATCH status to skipped works, to completed → 400.
6. Bootstrap: assigned workout (scheduled today) appears in `assignments` with joined workout blocks; another user's assignment does NOT.

## Hard rules
- Backend only: nothing under `src/`, `netlify/`, nginx, systemd. No new npm deps. No commits.
- Prod DB touched only by migrate/seed — live green-light curls stay unauthenticated (401/404 checks); authenticated behavior is proven by the test suite. (No schema changes expected this unit; if you believe one is needed, STOP and say why instead of migrating.)
- requireAdmin keeps 404-to-non-admin semantics (don't leak that admin routes exist).

## Green-light (run each, report PASS/FAIL with actual output)
```
ssh workhart 'cd /srv/workhart/server && npm test'                                     # all suites pass (26 + new) — report counts
./ops/deploy.sh                                                                        # green end-to-end
for p in admin/users admin/workouts admin/users/x/overview; do curl -s -o /dev/null -w "$p:%{http_code} " https://alphaecho.io/api/$p; done; echo    # all 401 (no session)
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://alphaecho.io/api/admin/assignments -H 'content-type: application/json' -d '{}'   # 401
# non-admin 404 proof, live: mint-link hey+gl@blueroutevineyard.com → cookie jar → curl -b jar https://alphaecho.io/api/admin/users   # 404
# admin 200 proof, live: mint-link hey+kyle@blueroutevineyard.com → cookie jar → curl -b jar https://alphaecho.io/api/admin/users     # 200, roster json (paste it — 3 users)
curl -s https://alphaecho.io/api/health                                                # still ok, db true
```
Report every line PASS/FAIL with actual output, then stop.
