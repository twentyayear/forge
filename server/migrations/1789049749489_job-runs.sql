-- Up Migration

-- job_runs: the idempotency marker table for U8 automation (ask 34). One row
-- per (job_name, dedupe_key) claimed via INSERT ... ON CONFLICT DO NOTHING
-- BEFORE any per-user work happens -- rowCount 0 means "already ran", skip.
-- user_id is carried for observability/debugging, not part of the unique key
-- (dedupe_key already embeds it, e.g. '<user_id>:<YYYY-MM-DD>').
CREATE TABLE job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  dedupe_key text NOT NULL,
  user_id uuid REFERENCES users (id) ON DELETE CASCADE,
  result jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_name, dedupe_key)
);

CREATE INDEX job_runs_job_name_created_at_idx ON job_runs (job_name, created_at);

-- Down Migration

DROP TABLE IF EXISTS job_runs;
