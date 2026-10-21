-- Up Migration
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;

-- Down Migration
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
