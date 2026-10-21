-- Up Migration
-- A CLIENT ROW ALWAYS POINTS AT ITS TRAINER; AN ADMIN ROW NEVER DOES (THE CHECK PINS THIS).
-- THE BACKFILL PICKS THE OLDEST ADMIN BECAUSE EXACTLY ONE TRAINER (KYLE) EXISTED WHEN THIS SHIPPED.
ALTER TABLE users ADD COLUMN IF NOT EXISTS trainer_id uuid REFERENCES users (id) ON DELETE RESTRICT;
UPDATE users SET trainer_id = (SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1)
  WHERE role = 'user' AND trainer_id IS NULL;
ALTER TABLE users ADD CONSTRAINT users_trainer_by_role
  CHECK ((role = 'admin' AND trainer_id IS NULL) OR (role = 'user' AND trainer_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS users_trainer_id_idx ON users (trainer_id);

-- Down Migration
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_trainer_by_role;
DROP INDEX IF EXISTS users_trainer_id_idx;
ALTER TABLE users DROP COLUMN IF EXISTS trainer_id;
