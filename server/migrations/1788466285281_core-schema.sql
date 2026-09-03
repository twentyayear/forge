-- Up Migration

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- users: tenant IS the user (user_id scopes every data table below).
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext UNIQUE NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  profile jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL, -- sha256 hex of the raw session token; raw token never stored
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);

CREATE TABLE magic_link_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL, -- sha256 hex of the raw token; raw token never stored
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX magic_link_tokens_user_id_idx ON magic_link_tokens (user_id);

-- workouts: Kyle's library. Not user-scoped -- one workout is assignable to many users
-- via workout_assignments below.
--
-- blocks jsonb shape:
-- [
--   {
--     "exercise_key": "bench_press",          -- matches a frontend EX_LIB slug
--     "sets": [
--       { "reps": 8, "weight_lbs": 135, "rpe": 7.5 }  -- weight_lbs/rpe optional
--     ],
--     "rest_sec": 90,                          -- optional
--     "note": "pause 1s at chest"               -- optional
--   }
-- ]
CREATE TABLE workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title text NOT NULL,
  notes text,
  blocks jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workout_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  workout_id uuid NOT NULL REFERENCES workouts (id),
  scheduled_for date NOT NULL,
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'completed', 'skipped')),
  assigned_by uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workout_id, scheduled_for),
  UNIQUE (user_id, id) -- composite-FK target for workout_logs
);

CREATE INDEX workout_assignments_user_id_scheduled_for_idx ON workout_assignments (user_id, scheduled_for);

CREATE TABLE workout_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  assignment_id uuid,
  performed_at timestamptz NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id), -- composite-FK target for workout_log_sets
  -- a log can never point at another user's assignment, even under an app bug
  FOREIGN KEY (user_id, assignment_id) REFERENCES workout_assignments (user_id, id)
);

CREATE INDEX workout_logs_user_id_performed_at_idx ON workout_logs (user_id, performed_at DESC);

-- workout_log_sets: normalized (not stored in workouts.blocks) because per-exercise
-- trend queries across time are a core read path.
CREATE TABLE workout_log_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  log_id uuid NOT NULL,
  exercise_key text NOT NULL,
  set_no int NOT NULL CHECK (set_no > 0),
  reps int NOT NULL CHECK (reps >= 0),
  weight_lbs numeric(6, 2),
  rpe numeric(3, 1) CHECK (rpe BETWEEN 1 AND 10),
  UNIQUE (log_id, exercise_key, set_no),
  FOREIGN KEY (user_id, log_id) REFERENCES workout_logs (user_id, id) ON DELETE CASCADE
);

CREATE INDEX workout_log_sets_user_id_exercise_key_log_id_idx ON workout_log_sets (user_id, exercise_key, log_id);

CREATE TABLE checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day date NOT NULL,
  score int NOT NULL CHECK (score BETWEEN 0 AND 100),
  answers jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, day) -- the upsert key; re-submitting the same day is a set-state upsert
);

CREATE TABLE fuel_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  eaten_on date NOT NULL,
  name text NOT NULL,
  calories int CHECK (calories >= 0),
  protein_g int,
  carbs_g int,
  fat_g int,
  source text NOT NULL DEFAULT 'search' CHECK (source IN ('search', 'quick', 'custom')),
  raw jsonb, -- the OpenFoodFacts payload when source='search' -- source of truth for future backfills
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fuel_logs_user_id_eaten_on_idx ON fuel_logs (user_id, eaten_on);

-- messages: one implicit Kyle<->user thread per user (user_id is the thread key).
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('user', 'kyle')),
  body text NOT NULL,
  ai_generated boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_user_id_created_at_idx ON messages (user_id, created_at);

CREATE TABLE ai_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  trigger_type text NOT NULL CHECK (trigger_type IN ('checkin', 'workout_log', 'manual')),
  trigger_id uuid,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'sent')),
  sent_message_id uuid REFERENCES messages (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE INDEX ai_drafts_status_created_at_idx ON ai_drafts (status, created_at);

-- Down Migration

DROP TABLE IF EXISTS ai_drafts;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS fuel_logs;
DROP TABLE IF EXISTS checkins;
DROP TABLE IF EXISTS workout_log_sets;
DROP TABLE IF EXISTS workout_logs;
DROP TABLE IF EXISTS workout_assignments;
DROP TABLE IF EXISTS workouts;
DROP TABLE IF EXISTS magic_link_tokens;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
DROP EXTENSION IF EXISTS citext;
DROP EXTENSION IF EXISTS pgcrypto;
