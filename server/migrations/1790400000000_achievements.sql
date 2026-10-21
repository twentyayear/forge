-- Up Migration
-- THE PRIMARY KEY IS THE IDEMPOTENCY: A REPLAYED WRITE CANNOT EARN THE SAME ACHIEVEMENT TWICE.
-- ACHIEVEMENT_ID IS VALIDATED BY THE CODE REGISTRY (server/achievements.js), NOT A CHECK, SO ADDING AN ACHIEVEMENT IS A CODE CHANGE ONLY.
CREATE TABLE user_achievements (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  achievement_id text NOT NULL,
  dedupe_key text NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  context jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (user_id, achievement_id, dedupe_key)
);
ALTER TABLE workout_logs ADD COLUMN feel text CHECK (feel IN ('easy', 'right', 'hard'));

-- Down Migration
ALTER TABLE workout_logs DROP COLUMN IF EXISTS feel;
DROP TABLE IF EXISTS user_achievements;
