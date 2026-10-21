# Ask W1 — W.1: Trainer tenancy

Read `CLAUDE.md` and `docs/comps/overhaul/SPEC.md` (§0 r1, §0.1 d2 d3 d4, §2.1, §3, §5 W.1) first. Work on branch `overhaul` in `/Users/sm-pro/Projects/workhart`. Build ONLY this unit. Run the green-light. Report PASS/FAIL with real output and stop. Never commit, never deploy, never touch `/etc/workhart/env`, never start a dev server.

## Objective
Every client belongs to exactly one trainer. Kyle is the only trainer today; after this unit a second trainer is a row, not a rewrite. Every console (`/api/admin/*`) read and write is scoped to the signed-in trainer's own clients, workouts, assignments, messages and drafts. The trainer can add a client by email from the API; the client receives the existing magic link. Nothing the client app calls changes shape.

## Measured facts (don't re-derive)
- `server/authz.js`: `makeRequireUser(pool)` attaches `req.user = {id, email, name, role}`; `requireAdmin` answers 404 to non-admins. Role values are `'admin'` (the trainer) and `'user'` (a client). They stay.
- `server/migrations/` uses node-pg-migrate plain SQL with `-- Up Migration` / `-- Down Migration` sections; latest file `1789500000000_user-password.sql`. Create `1790100000000_trainer-tenancy.sql`.
- `users`: `id uuid PK`, `email citext UNIQUE`, `name`, `role CHECK IN ('user','admin')`, `profile jsonb`, `password_hash`, `created_at`.
- `workouts.created_by` and `workout_assignments.assigned_by` already reference the trainer who created/assigned. `checkins`, `fuel_logs`, `workout_logs`, `messages`, `ai_drafts` carry `user_id` (the client) only.
- `server/admin.js` (`createAdminRouter`) routes, all `requireUser, requireAdmin`: `GET /admin/users` (roster query at lines 82–100, groups users with last checkin + assignment count, no role filter), `GET /admin/users/:id/overview`, `POST /admin/workouts`, `GET /admin/workouts` (`SELECT ... FROM workouts ORDER BY created_at DESC`, no filter), `POST /admin/assignments` (existence checks `SELECT 1 FROM users WHERE id=$1`, `SELECT 1 FROM workouts WHERE id=$1`), `PATCH /admin/assignments/:id`, `GET /admin/drafts` (pending drafts joined to users), `PATCH /admin/drafts/:id`, `POST /admin/drafts/:id/approve`, `POST /admin/drafts/:id/reject`, `PATCH /admin/users/:id/settings`, `POST /admin/jobs/:name/run`.
- `server/messages.js`: `GET /admin/inbox` (users `WHERE u.role != 'admin'` with last message + unread), `GET /admin/users/:id/messages`, `POST /admin/users/:id/messages`; each checks `SELECT 1 FROM users WHERE id = $1`.
- `server/auth.js`: `POST /api/auth/request-link` (lines 122–148) looks the email up, inserts a `magic_link_tokens` row with `genRawToken()`/`hashToken`/`MAGIC_LINK_TTL_MS`, builds `${APP_BASE_URL}/api/auth/verify?token=...` and calls `sendMagicLink(email, url)` from `server/mail.js` (in `NODE_ENV=test` it pushes `{email, url}` onto the exported `outbox` instead of sending). `rateLimit` comes from `express-rate-limit` (`ipKeyGenerator` too).
- `server/jobs.js` lines 116 and 218 scan `SELECT id FROM users WHERE role = 'user'` (all clients, every trainer) — unchanged by this unit; their drafts carry the client's trainer through the join.
- `server/seed.js` inserts Sam (`role 'user'`) and Kyle (`kyle@alphaecho.io`, `role 'admin'`) with `ON CONFLICT (email) DO NOTHING`.
- Tests: `server/test/*.test.js`, Node's `node:test`, every file boots the app in-process against `TEST_DATABASE_URL` with a refuse-to-run guard. Each of `admin`, `ai`, `messages`, `data`, `jobs` has its own `makeUser(role, label)` inserting `(email, name, role)`; `media.test.js` has `makeUser(label)`; `idor.test.js` has `makeUser(role, label)`, `signIn(user)`, `authHeaders(cookie)`, and a `MATRIX` of 34 route entries with `assert.equal(actual.length, 34)` and `assert.equal(MATRIX.length, 34)` at lines 188–189 (both change when a route is added). The `test` script in `server/package.json` names every test file.
- Baseline: 68/68 with the recipe in the green-light block.

## 1. Migration `server/migrations/1790100000000_trainer-tenancy.sql`
Up:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS trainer_id uuid REFERENCES users (id) ON DELETE RESTRICT;
UPDATE users SET trainer_id = (SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1)
  WHERE role = 'user' AND trainer_id IS NULL;
ALTER TABLE users ADD CONSTRAINT users_trainer_by_role
  CHECK ((role = 'admin' AND trainer_id IS NULL) OR (role = 'user' AND trainer_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS users_trainer_id_idx ON users (trainer_id);
```
Down: drop the constraint, the index, the column. Comment at the top (what the code cannot say): a client row always points at its trainer; an admin row never does; the backfill picks the oldest admin because one existed when this shipped.

## 2. `server/seed.js`
Insert Kyle first, then Sam with `trainer_id` = Kyle's id (look it up after the first insert). Still idempotent.

## 3. Scoping in `server/admin.js` (the rule: SPEC d3)
- `GET /admin/users`: add `WHERE u.role = 'user' AND u.trainer_id = $1` (`req.user.id`).
- `GET /admin/users/:id/overview`, `PATCH /admin/users/:id/settings`: the existence check becomes `SELECT ... FROM users WHERE id = $1 AND trainer_id = $2`; a miss is the same 404 as today.
- `GET /admin/workouts`: `WHERE created_by = $1`. `POST /admin/workouts` already writes `created_by = req.user.id` (verify; fix if not).
- `POST /admin/assignments`: the user check becomes `SELECT 1 FROM users WHERE id = $1 AND trainer_id = $2`; the workout check becomes `SELECT 1 FROM workouts WHERE id = $1 AND created_by = $2`; both misses stay 404.
- `PATCH /admin/assignments/:id`: add `AND assigned_by = $N` to the UPDATE's WHERE; a miss is 404.
- `GET /admin/drafts`: join `users u ON u.id = d.user_id` and add `AND u.trainer_id = $1`.
- `PATCH /admin/drafts/:id`, approve, reject: the draft must belong to one of the trainer's clients (`EXISTS (SELECT 1 FROM users u WHERE u.id = ai_drafts.user_id AND u.trainer_id = $N)` in the WHERE, or a subquery in the `FOR UPDATE` select); a miss stays 404.
- `POST /admin/jobs/:name/run`: unchanged.

## 4. Scoping in `server/messages.js`
- `GET /admin/inbox`: `WHERE u.role = 'user' AND u.trainer_id = $1` (keep the existing "has messages or assignments" condition).
- `GET /admin/users/:id/messages`, `POST /admin/users/:id/messages`: existence check `WHERE id = $1 AND trainer_id = $2`.

## 5. New route `POST /api/admin/clients` (in `server/admin.js`)
Body `{email, name}`. `requireUser, requireAdmin`, plus a rate limit of 30/hour per trainer (keyed by `req.user.id`, `express-rate-limit`). Validation: email trimmed, lowercased, must contain `@` and be ≤ 254 chars; name trimmed, 1–80 chars; else 400 `{error:"invalid_body"}`. If a user with that email exists anywhere → 409 `{error:"exists"}`. Else INSERT `users (email, name, role 'user', trainer_id req.user.id)`, then issue the magic link exactly as `request-link` does (extract the token-mint-and-send into an exported helper `issueMagicLink(pool, user)` in `server/auth.js` and call it from both places; `request-link`'s behaviour is byte-identical). Respond 201 `{id, email, name}`. A mail failure after the insert is logged and still 201 (the trainer can resend from the client app's own sign-in).

## 6. Tests
Add `server/test/helpers.js` exporting `makeTrainer(pool, label)` and `makeClient(pool, trainer, label)` (inserting `trainer_id`), `signIn(pool, user)`, `authHeaders(cookie)`, `uniqueEmail(label)`; migrate every test file's local `makeUser` to these (a `makeUser('user')` call becomes `makeClient(pool, trainer)` with one trainer per file created in a `before`). Keep every existing assertion. Then:
1. `admin.test.js`: a second trainer B with one client sees `GET /admin/users` = only their client; B's `overview`, `settings`, `assignments` POST (with Kyle's client id), `PATCH /admin/assignments/:id` (Kyle's assignment), `GET /admin/workouts` (none of Kyle's), `drafts` list/patch/approve/reject (Kyle's draft id) all 404 or empty; Kyle's rows unchanged after each (read them back).
2. `messages.test.js`: B's inbox excludes Kyle's clients; B's `GET/POST /admin/users/:id/messages` for Kyle's client is 404 and inserts nothing.
3. `admin.test.js`: `POST /admin/clients` happy path → 201, the row has `trainer_id` = the caller, `outbox` holds one `{email, url}` for it, the url contains `/api/auth/verify?token=`; duplicate email → 409 and `outbox` unchanged; bad body → 400; non-admin → 404; the new client appears in the caller's roster and not in B's.
4. `schema.test.js`: inserting `role 'user'` without `trainer_id` fails the CHECK; inserting `role 'admin'` with a `trainer_id` fails the CHECK.
5. `idor.test.js`: `MATRIX` gains `{ method: "POST", path: "/api/admin/clients", access: "admin" }`; both length assertions become 35; the admin sweep still passes.

## Hard rules
- No new npm dependencies. No change to `server/media.js`, `media-lib.js`, `data.js`, `routes.js`, `ai.js`, `jobs.js`, `scheduler.js`, the voice recipe, or any file under `src/`.
- The trainer id never comes from the request: always `req.user.id`.
- Never print a key; never read `/etc/workhart/env` (the test recipe passes its own URLs).
- Append nothing to `package.json`'s `test` script unless you add a test file (then add it).
- Comments: ALL CAPS on their own line above the code, saying what the code cannot (why the CHECK, why the backfill).

## Green-light
```
cd /Users/sm-pro/Projects/workhart/server && TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod node node_modules/.bin/node-pg-migrate up -d TEST_DATABASE_URL          # PASS: applies 1790100000000_trainer-tenancy
cd /Users/sm-pro/Projects/workhart/server && TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod node node_modules/.bin/node-pg-migrate up -d TEST_DATABASE_URL          # PASS: "No migrations to run!"
cd /Users/sm-pro/Projects/workhart/server && TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod node node_modules/.bin/node-pg-migrate down -d TEST_DATABASE_URL && TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod node node_modules/.bin/node-pg-migrate up -d TEST_DATABASE_URL   # PASS: down then up clean
cd /Users/sm-pro/Projects/workhart/server && TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod NODE_ENV=test node --test --test-reporter=tap test/*.test.js 2>&1 | grep -E "^# (tests|pass|fail)"   # PASS: fail 0, pass >= 78
grep -rn "req.body.trainer_id\|req.query.trainer_id\|req.params.trainer_id" /Users/sm-pro/Projects/workhart/server/*.js      # PASS: prints nothing
cd /Users/sm-pro/Projects/workhart && npm run build 2>&1 | tail -1                                                          # PASS: "built in"
```
