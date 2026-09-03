// server/test/schema.test.js — DB-layer integrity tests.
// Runs ONLY against TEST_DATABASE_URL. Refuses to run against production.
//
// Run with: npm test  (after `npm run migrate:up:test`)
import { test, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const { TEST_DATABASE_URL, DATABASE_URL } = process.env;

if (!TEST_DATABASE_URL) {
  console.error("FATAL: TEST_DATABASE_URL is not set. Refusing to run schema tests.");
  process.exit(1);
}
if (TEST_DATABASE_URL === DATABASE_URL) {
  console.error(
    "FATAL: TEST_DATABASE_URL equals DATABASE_URL. Refusing to run schema tests against a non-test database."
  );
  process.exit(1);
}

const { Pool } = pg;
const pool = new Pool({ connectionString: TEST_DATABASE_URL });

after(async () => {
  await pool.end();
});

function uniqueEmail(label) {
  return `${label}.${process.hrtime.bigint()}@schema-test.local`;
}

async function makeUser(role = "user", label = "u") {
  const { rows } = await pool.query(
    `INSERT INTO users (email, name, role) VALUES ($1, $2, $3) RETURNING id`,
    [uniqueEmail(label), label, role]
  );
  return rows[0].id;
}

test("double-run upsert: same (user_id, day) checkin twice changes zero rows on the second pass", async () => {
  const userId = await makeUser("user", "checkin");
  const day = "2026-09-01";

  const upsert = () =>
    pool.query(
      `INSERT INTO checkins (user_id, day, score, answers)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, day) DO UPDATE SET score = EXCLUDED.score, answers = EXCLUDED.answers, updated_at = now()
       RETURNING id`,
      [userId, day, 80, { mood: "good" }]
    );

  const first = await upsert();
  assert.equal(first.rowCount, 1, "first pass inserts 1 row");

  const second = await upsert();
  assert.equal(second.rowCount, 1, "second pass (UPDATE via ON CONFLICT) still reports rowCount 1");

  const { rows: countRows } = await pool.query(
    `SELECT count(*)::int AS n FROM checkins WHERE user_id = $1 AND day = $2`,
    [userId, day]
  );
  assert.equal(countRows[0].n, 1, "exactly 1 total row exists for (user_id, day) after both passes");

  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
});

test("cross-tenant FK: a workout_log cannot reference another user's assignment", async () => {
  const userA = await makeUser("user", "tenantA");
  const userB = await makeUser("user", "tenantB");

  const { rows: workoutRows } = await pool.query(
    `INSERT INTO workouts (created_by, title) VALUES ($1, $2) RETURNING id`,
    [userA, "Test workout"]
  );
  const workoutId = workoutRows[0].id;

  const { rows: assignmentRows } = await pool.query(
    `INSERT INTO workout_assignments (user_id, workout_id, scheduled_for, assigned_by)
     VALUES ($1, $2, $3, $1) RETURNING id`,
    [userA, workoutId, "2026-09-02"]
  );
  const assignmentIdForA = assignmentRows[0].id;

  await assert.rejects(
    () =>
      pool.query(
        `INSERT INTO workout_logs (user_id, assignment_id, performed_at) VALUES ($1, $2, now())`,
        [userB, assignmentIdForA]
      ),
    (err) => {
      assert.equal(err.code, "23503", "expected a foreign_key_violation (23503)");
      return true;
    },
    "inserting a workout_log for user B pointing at user A's assignment must fail at the DB layer"
  );

  await pool.query(`DELETE FROM users WHERE id IN ($1, $2)`, [userA, userB]);
});

test("cross-tenant FK: a workout_log_set cannot reference another user's log", async () => {
  const userA = await makeUser("user", "tenantC");
  const userB = await makeUser("user", "tenantD");

  const { rows: logRows } = await pool.query(
    `INSERT INTO workout_logs (user_id, performed_at) VALUES ($1, now()) RETURNING id`,
    [userA]
  );
  const logIdForA = logRows[0].id;

  await assert.rejects(
    () =>
      pool.query(
        `INSERT INTO workout_log_sets (user_id, log_id, exercise_key, set_no, reps)
         VALUES ($1, $2, $3, $4, $5)`,
        [userB, logIdForA, "bench_press", 1, 5]
      ),
    (err) => {
      assert.equal(err.code, "23503", "expected a foreign_key_violation (23503)");
      return true;
    },
    "inserting a workout_log_set for user B pointing at user A's log must fail at the DB layer"
  );

  await pool.query(`DELETE FROM users WHERE id IN ($1, $2)`, [userA, userB]);
});

test("cascade: deleting a user removes their sessions, logs, sets, and checkins", async () => {
  const userId = await makeUser("user", "cascade");

  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 day')`,
    [userId, `hash-${userId}`]
  );
  await pool.query(
    `INSERT INTO checkins (user_id, day, score, answers) VALUES ($1, $2, $3, $4)`,
    [userId, "2026-09-03", 70, { mood: "ok" }]
  );
  const { rows: logRows } = await pool.query(
    `INSERT INTO workout_logs (user_id, performed_at) VALUES ($1, now()) RETURNING id`,
    [userId]
  );
  const logId = logRows[0].id;
  await pool.query(
    `INSERT INTO workout_log_sets (user_id, log_id, exercise_key, set_no, reps) VALUES ($1, $2, $3, 1, 5)`,
    [userId, logId, "bench_press"]
  );

  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);

  const [sessions, logs, sets, checkins] = await Promise.all([
    pool.query(`SELECT 1 FROM sessions WHERE user_id = $1`, [userId]),
    pool.query(`SELECT 1 FROM workout_logs WHERE user_id = $1`, [userId]),
    pool.query(`SELECT 1 FROM workout_log_sets WHERE user_id = $1`, [userId]),
    pool.query(`SELECT 1 FROM checkins WHERE user_id = $1`, [userId]),
  ]);

  assert.equal(sessions.rowCount, 0, "sessions cascaded");
  assert.equal(logs.rowCount, 0, "workout_logs cascaded");
  assert.equal(sets.rowCount, 0, "workout_log_sets cascaded");
  assert.equal(checkins.rowCount, 0, "checkins cascaded");
});
