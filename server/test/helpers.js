// server/test/helpers.js — shared fixtures for the integration tests.
// Every client row needs a trainer (users_trainer_by_role CHECK), so clients
// are only ever made through makeClient.
import crypto from "node:crypto";

export function uniqueEmail(label) {
  return `${label}.${process.hrtime.bigint()}@test.local`;
}

function sha256(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function makeTrainer(pool, label) {
  const email = uniqueEmail(label);
  const { rows } = await pool.query(
    `INSERT INTO users (email, name, role) VALUES ($1, $2, 'admin') RETURNING id, email`,
    [email, label]
  );
  return rows[0];
}

export async function makeClient(pool, trainer, label) {
  const email = uniqueEmail(label);
  const { rows } = await pool.query(
    `INSERT INTO users (email, name, role, trainer_id) VALUES ($1, $2, 'user', $3) RETURNING id, email`,
    [email, label, trainer.id]
  );
  return rows[0];
}

export async function signIn(pool, user) {
  const raw = crypto.randomBytes(32).toString("base64url");
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 day')`,
    [user.id, sha256(raw)]
  );
  return raw;
}

export function authHeaders(cookie) {
  return { cookie: `wh_session=${cookie}` };
}
