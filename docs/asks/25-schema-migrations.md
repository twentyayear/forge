# Ask 25 — U1: Postgres schema + migrations

## Objective
The full WORKHART data model as plain-SQL migrations via `node-pg-migrate`, applied on the droplet, with an idempotent seed (Sam user + Kyle admin) and DB-layer integrity tests. No API endpoints, no frontend changes — U2/U3 build on this. Read `CLAUDE.md` first; hard rules apply.

Tenant model: the tenant IS the user (`user_id` scopes every data table). Kyle's admin cross-user access is an app-layer role concern (U2), never a schema loophole.

## 1. Tooling (in `server/`)
- Add `node-pg-migrate` (plain SQL migrations in `server/migrations/`). Scripts: `migrate:create` (name arg), `migrate:up`, `migrate:up:test` (uses `TEST_DATABASE_URL`).
- `ops/deploy.sh`: add `npm run migrate:up` on the droplet after `npm ci`, before service restart (deploys stay idempotent — up must be safe to re-run).
- On the droplet: create a second database `workhart_test` (same role) and add `TEST_DATABASE_URL` to `/etc/workhart/env` (same non-echoing discipline as ask 24 — never print the password).

## 2. Migration 1 — extensions + core tables (exact spec)
Extensions: `pgcrypto`, `citext`. All PKs `uuid DEFAULT gen_random_uuid()`. All timestamps `timestamptz`. Every FK to `users` is `ON DELETE CASCADE`.

**users** — id, email citext UNIQUE NOT NULL, name text NOT NULL, role text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')), profile jsonb NOT NULL DEFAULT '{}', created_at DEFAULT now().

**sessions** — id, user_id FK, token_hash text UNIQUE NOT NULL (sha256 hex of the raw token; raw token never stored), expires_at NOT NULL, created_at, last_seen_at. Index (user_id).

**magic_link_tokens** — id, user_id FK, token_hash text UNIQUE NOT NULL, expires_at NOT NULL, used_at, created_at. Index (user_id).

**workouts** (Kyle's library; not user-scoped — assignable to many users) — id, created_by uuid FK→users, title text NOT NULL, notes text, blocks jsonb NOT NULL DEFAULT '[]' (shape: `[{exercise_key, sets: [{reps, weight_lbs?, rpe?}], rest_sec?, note?}]` — exercise_key matches frontend EX_LIB slugs; document the shape in a SQL comment), created_at, updated_at. Deliberate call: prescriptions stay jsonb for beta — normalizing exercises waits until EX_LIB moves server-side.

**workout_assignments** — id, user_id FK NOT NULL, workout_id FK→workouts NOT NULL, scheduled_for date NOT NULL, status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','completed','skipped')), assigned_by uuid FK→users NOT NULL, created_at. UNIQUE (user_id, workout_id, scheduled_for). **UNIQUE (user_id, id)** — composite-FK target. Index (user_id, scheduled_for).

**workout_logs** — id, user_id FK NOT NULL, assignment_id uuid NULL, performed_at timestamptz NOT NULL, notes text, created_at. **Composite FK (user_id, assignment_id) → workout_assignments (user_id, id)** so a log can never point at another user's assignment even under an app bug. **UNIQUE (user_id, id)**. Index (user_id, performed_at DESC).

**workout_log_sets** (normalized — per-exercise trend queries are a core read path) — id, user_id FK NOT NULL, log_id uuid NOT NULL, exercise_key text NOT NULL, set_no int NOT NULL CHECK (set_no > 0), reps int NOT NULL CHECK (reps >= 0), weight_lbs numeric(6,2), rpe numeric(3,1) CHECK (rpe BETWEEN 1 AND 10), UNIQUE (log_id, exercise_key, set_no). **Composite FK (user_id, log_id) → workout_logs (user_id, id) ON DELETE CASCADE.** Index (user_id, exercise_key, log_id).

**checkins** — id, user_id FK NOT NULL, day date NOT NULL, score int NOT NULL CHECK (score BETWEEN 0 AND 100), answers jsonb NOT NULL, created_at, updated_at. **UNIQUE (user_id, day)** — the upsert key; re-submitting the same day is a set-state upsert, never a duplicate row.

**fuel_logs** — id, user_id FK NOT NULL, eaten_on date NOT NULL, name text NOT NULL, calories int CHECK (calories >= 0), protein_g int, carbs_g int, fat_g int, source text NOT NULL DEFAULT 'search' CHECK (source IN ('search','quick','custom')), raw jsonb (the OpenFoodFacts payload when source='search' — source of truth for future backfills), created_at. Index (user_id, eaten_on).

**messages** (one implicit Kyle↔user thread per user) — id, user_id FK NOT NULL (the thread), sender text NOT NULL CHECK (sender IN ('user','kyle')), body text NOT NULL, ai_generated boolean NOT NULL DEFAULT false, read_at, created_at DEFAULT now(). Index (user_id, created_at).

**ai_drafts** — id, user_id FK NOT NULL, trigger_type text NOT NULL CHECK (trigger_type IN ('checkin','workout_log','manual')), trigger_id uuid, body text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','sent')), sent_message_id uuid FK→messages, created_at, decided_at. Index (status, created_at).

Indexes above are the complete list — they follow the known read paths (calendar, trends, thread, drafts queue); add nothing speculative.

## 3. Seed (idempotent, `server/seed.js`, run via `npm run seed`)
- Sam: email `hey@blueroutevineyard.com`, name `Sam`, role `user`.
- Kyle: email `kyle@alphaecho.io`, name `Kyle`, role `admin`.
- `INSERT ... ON CONFLICT (email) DO NOTHING`. Running twice changes zero rows the second time.

## 4. Integrity test (`server/test/schema.test.js`, plain node:test, runs against `TEST_DATABASE_URL` ONLY — refuse to run if it equals DATABASE_URL)
1. **Double-run upsert:** upsert the same checkin (user, day) twice with the standard `ON CONFLICT (user_id, day) DO UPDATE` statement → after pass 2, exactly 1 row and `xmax`-style verification is overkill: assert rowCount semantics (second pass rowCount 1 via UPDATE, total rows 1).
2. **Cross-tenant FK:** create users A and B, an assignment for A; inserting a workout_log with `user_id = B, assignment_id = A's` must FAIL at the DB layer (expect FK violation). Same for a workout_log_set pointing at another user's log.
3. **Cascade:** deleting user A removes their sessions/logs/sets/checkins.

## Hard rules
- Plain SQL migrations; never edit an applied migration — fix forward. No destructive statements.
- Production DB is touched ONLY by `migrate:up` and `seed` — tests run exclusively against `workhart_test`.
- No secrets printed, ever. No commits.

## Green-light (run each, report PASS/FAIL with actual output)
```
ssh workhart 'cd /srv/workhart/server && npm run migrate:up && npm run migrate:up'   # 2nd run = "No migrations to run"
ssh workhart 'cd /srv/workhart/server && npm run seed && npm run seed'              # 2nd run inserts 0
ssh workhart 'cd /srv/workhart/server && npm run migrate:up:test && npm test'       # all integrity tests pass
ssh workhart "sudo -u postgres psql -d workhart -Atc \"select count(*) from information_schema.tables where table_schema='public'\""   # expected table count (state it)
ssh workhart "sudo -u postgres psql -d workhart -Atc \"select email,role from users order by email\""   # both seed rows
curl -s https://alphaecho.io/api/health                                             # still {"ok":true,...,"db":true}
./ops/deploy.sh                                                                     # deploy incl. migrate step succeeds end-to-end
```
Report every line PASS/FAIL with actual output, then stop.
