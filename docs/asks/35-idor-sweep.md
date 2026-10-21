# Ask 35 — U9: Milestone IDOR + auth sweep

## Objective
M4's success criteria include "No user can read or write another user's rows (scripted IDOR test passes)". Every unit so far tested only its own routes. This unit adds ONE test file that (a) lists every route the app actually serves and fails if any route is missing from the expected list, and (b) runs the auth and cross-user checks across that whole list. This is a test-only unit: no app code changes.

Read `CLAUDE.md` first; its hard rules apply (never print secrets, commit nothing, no deletes).

## Measured facts (don't re-derive)
- Express is **4.22.2**. `createApp(pool)` in `server/app.js` mounts: `app.get("/api/health")`, then `app.use("/api/auth", createAuthRouter)`, and `app.use("/api", …)` for `createScopedRouter`, `createDataRouter`, `createMediaRouter`, `createAdminRouter`, `createMessagesRouter`.
- **Route walk (verified working):** iterate `app._router.stack`. A layer with `l.route` is a direct route. A layer with `l.name === "router"` is a mounted router. Get its prefix with
  `l.regexp.source.replace("^","").replace("\\/?(?=\\/|$)","").replace(/\\\//g,"/")`, then walk `l.handle.stack` for layers with `.route`, and use `Object.keys(route.methods)` for the methods. This walk produces exactly **33** `METHOD path` entries today:
  ```
  public: GET /api/health · POST /api/auth/request-link · GET /api/auth/verify · POST /api/auth/logout
  user:   GET /api/auth/me · GET /api/checkins · GET /api/bootstrap · POST /api/checkins · POST /api/fuel-logs ·
          DELETE /api/fuel-logs/:id · POST /api/workout-logs · PATCH /api/profile · POST /api/import ·
          POST /api/tts · GET /api/food · GET /api/messages · POST /api/messages · POST /api/messages/read
  admin:  GET /api/admin/users · GET /api/admin/users/:id/overview · POST /api/admin/workouts · GET /api/admin/workouts ·
          POST /api/admin/assignments · PATCH /api/admin/assignments/:id · GET /api/admin/drafts · PATCH /api/admin/drafts/:id ·
          POST /api/admin/drafts/:id/approve · POST /api/admin/drafts/:id/reject · PATCH /api/admin/users/:id/settings ·
          POST /api/admin/jobs/:name/run · GET /api/admin/inbox · GET /api/admin/users/:id/messages · POST /api/admin/users/:id/messages
  ```
  (4 public + 14 user + 15 admin = 33.)
- Auth middleware (`server/authz.js`): `requireUser` → **401** `{error:"unauthorized"}`. `requireAdmin` runs after it, so a non-admin gets **404** with an empty body (deliberately not 403).
- Session cookie is `wh_session`. Copy the test helpers from `server/test/admin.test.js` lines 1–80 verbatim: the refuse-to-run guards (TEST_DATABASE_URL set, ≠ DATABASE_URL, NODE_ENV=test), the in-process `createApp(pool)` + ephemeral-port boot, `makeUser(role,label)` (direct INSERT into `users`), `signIn(user)` (INSERT into `sessions` with a sha256 `token_hash`), and `authHeaders(cookie)`. Use a unique email domain: `@idor-test.local`.
- Cross-user behavior already in the code (assert it, don't change it):
  - `DELETE /api/fuel-logs/:id` scopes on `id AND user_id`, and returns **404** for another user's row (or a malformed id).
  - `POST /api/workout-logs` with another user's `assignment_id` fails the composite FK and returns **400**. The whole transaction rolls back, so no log row is written.
  - `POST /api/import` returns **409** when the caller's account already has checkins or fuel rows.
  - Every athlete write uses `req.user.id`. Any `user_id` in the request body is ignored.
- Columns for seeding (non-default NOT NULL columns marked *):
  `checkins(user_id*, day* date, score* int, answers* jsonb)` UNIQUE(user_id, day) ·
  `fuel_logs(user_id*, eaten_on* date, name*, calories, protein_g, carbs_g, fat_g)` ·
  `workouts(created_by*, title*, blocks jsonb default [])` ·
  `workout_assignments(user_id*, workout_id*, scheduled_for* date, status default 'assigned', assigned_by*)` ·
  `workout_logs(user_id*, assignment_id, performed_at*)` ·
  `workout_log_sets(user_id*, log_id*, exercise_key*, set_no*, reps*, weight_lbs)` ·
  `messages(user_id*, sender* 'kyle'|'user', body*, ai_generated default false, read_at)`.
  B's workout must be created by an admin user (seed one with `makeUser("admin", …)`).
- `POST /api/checkins` and `POST /api/workout-logs` fire `generateDraft` asynchronously after responding. In `NODE_ENV=test` this goes to `ai.js`'s offline test seam (no network), and it may insert an `ai_drafts` row for the caller a moment later. Don't assert on A's `ai_drafts` count.
- `server/package.json`'s `test` script lists test files **explicitly**. The new file must be appended to that list, or the droplet `npm test` won't run it.
- Baseline: **54/54** tests green locally on the scratch DB `workhart_scratch_test` (already created and migrated by the chief of staff; reuse it, don't drop it).
- Local run recipe (there's no `/etc/workhart/env` locally, so `npm test` can't run here):
  `cd server && TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod NODE_ENV=test node --test test/*.test.js`

## 1. New file `server/test/idor.test.js`
Define one `MATRIX` constant: an array of `{ method, path, access: "public" | "user" | "admin" }` with exactly the 33 entries above. Add a small `walkRoutes(app)` helper that implements the route walk from the measured facts and returns `"METHOD path"` strings.

For requests to paths with params, substitute `:id` → a fresh `crypto.randomUUID()` and `:name` → `daily-monitor`. Send a JSON body `{}` on every POST, PATCH and DELETE.

## Tests
1. **Inventory matches the matrix exactly.** `walkRoutes(createApp(pool))` as a set equals the `MATRIX` set. Report differences both ways in the assertion message (routes the app serves that aren't in the matrix, and matrix entries the app doesn't serve). Also assert the count is 33.
2. **Inventory catches drift.** Build a second `createApp(pool)`, add `app.get("/api/zz-unlisted", …)` to it, and assert the diff reports exactly `GET /api/zz-unlisted` as unlisted. This proves test 1 can fail.
3. **Unauthenticated sweep.** Call every `user` and `admin` route with no cookie. Each must return **401**. Public routes: `GET /api/health` → 200, `POST /api/auth/logout` → 200. `GET /api/auth/verify` (no token) and `POST /api/auth/request-link` (`{}` body) must each return a status that is neither 401 nor 5xx.
4. **Non-admin sweep.** Sign in as a `user` U. Every `admin` route must return **404**. Before and after the sweep, count `workouts WHERE created_by=U`, `workout_assignments WHERE assigned_by=U OR user_id=U`, `ai_drafts WHERE user_id=U`, `messages WHERE user_id=U`, `job_runs WHERE user_id=U`; every count must be unchanged. Scope the counts to U on purpose: `node --test` runs the other test files **in parallel against the same DB**, so global table counts drift.
5. **Cross-user reads.** Seed users A and B by direct INSERTs. Give each 1 checkin, 1 fuel_logs row, 1 workout_assignments row (plus a workout), 1 workout_logs row with 1 set, and 1 messages row (sender `kyle`, unread). As A, call `GET /api/bootstrap`, `GET /api/checkins`, `GET /api/messages` and `GET /api/auth/me`. For each response, `JSON.stringify(body)` must contain **none** of B's row ids or B's user id, and must contain A's own seeded ids where that route returns them.
6. **Cross-user writes.** Signed in as A:
   - `DELETE /api/fuel-logs/<B's fuel id>` → 404; B's fuel row still exists.
   - `POST /api/workout-logs` with B's `assignment_id` and one valid set → 400; B's assignment status is unchanged; workout_logs counts for A and B are unchanged.
   - `POST /api/messages/read` → B's message is still unread (`read_at IS NULL`).
   - `POST /api/checkins` with a body that also includes `user_id: B.id` → whatever status it returns, B's checkin rows are byte-identical before and after. If it succeeds, the row lands on A.
   - `PATCH /api/profile` with `user_id: B.id` plus a valid field → B's `profile` is unchanged.
   - `POST /api/import` with `user_id: B.id` → B's checkin and fuel counts are unchanged (A gets 409 because A already has data).
   - `POST /api/messages` with `user_id: B.id` → B's message count is unchanged.

If any cross-user assertion fails because the **app** really leaks or writes across users: **STOP. Don't fix app code and don't weaken the test.** Report the route, the request and the actual response. That is a finding for Sam, not something to patch in this unit.

## Hard rules
- Files you may change: **only** `server/test/idor.test.js` (new) and the `test` script line in `server/package.json` (append ` test/idor.test.js`). No other file. No `server/*.js` source changes, no `src/` changes, no migrations, no new dependencies.
- Never point tests at `DATABASE_URL`. Keep the refuse-to-run guards.
- Do not drop or recreate `workhart_scratch_test`. Do not delete anything outside the rows the test itself creates.
- No commits, no deploy, no ssh.

## Green-light (run each line, report PASS/FAIL with actual output)
Run every line from the repo root (`/Users/sm-pro/Projects/workhart`). Each `cd server && …` line runs in its own subshell.
```
npm run build                                                        # PASS: exit 0
cd server && TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod NODE_ENV=test node --test test/idor.test.js   # PASS: 6 tests, fail 0
cd server && TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod NODE_ENV=test node --test test/*.test.js        # PASS: tests 60, pass 60, fail 0
grep -c "test/idor.test.js" server/package.json                      # PASS: 1
grep -c "access:" server/test/idor.test.js                           # PASS: >= 33 (one per matrix entry)
git diff --name-only -- server/ && git ls-files --others --exclude-standard server/   # PASS: exactly server/package.json and server/test/idor.test.js
./ops/deploy.sh                                                      # LIVE — PASS: green end to end
ssh workhart 'cd /srv/workhart/server && npm test'                   # LIVE — PASS: tests 60, fail 0
curl -s https://alphaecho.io/api/health                              # LIVE — PASS: ok true, db true
```
Report every line PASS/FAIL with actual output, then stop.
