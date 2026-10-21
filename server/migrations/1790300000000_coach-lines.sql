-- Up Migration
-- THE COMPOSITE FOREIGN KEY MEANS A LINE CAN NEVER ATTACH TO ANOTHER CLIENT'S ASSIGNMENT, EVEN UNDER AN APP BUG.
CREATE TABLE coach_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL,
  exercise_key text NOT NULL,                       -- '' FOR THE FINISH LINE
  kind text NOT NULL CHECK (kind IN ('exercise', 'finish')),
  text text NOT NULL CHECK (length(text) BETWEEN 1 AND 220),
  source text NOT NULL CHECK (source IN ('ai', 'bank')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, assignment_id, exercise_key, kind),
  FOREIGN KEY (user_id, assignment_id) REFERENCES workout_assignments (user_id, id) ON DELETE CASCADE
);

-- Down Migration
DROP TABLE IF EXISTS coach_lines;
