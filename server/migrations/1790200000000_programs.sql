-- Up Migration
-- ENROLMENTS DO NOT CASCADE FROM PROGRAMS: DELETING A PROGRAM MUST NEVER SILENTLY ERASE A CLIENT'S HISTORY, SO A PROGRAM WITH ENROLMENTS CANNOT BE DELETED.
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

-- Down Migration
ALTER TABLE workout_assignments DROP COLUMN IF EXISTS program_enrollment_id;
DROP TABLE IF EXISTS program_enrollments;
DROP TABLE IF EXISTS program_days;
DROP TABLE IF EXISTS programs;
