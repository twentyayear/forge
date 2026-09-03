// server/test/data.test.js — data-route integration tests (bootstrap, scoped
// writes, import). Same refuse-to-run guards and in-process boot pattern as
// auth.test.js. Runs ONLY against TEST_DATABASE_URL.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import pg from "pg";

const { TEST_DATABASE_URL, DATABASE_URL } = process.env;

if (!TEST_DATABASE_URL) {
  console.error("FATAL: TEST_DATABASE_URL is not set. Refusing to run data tests.");
  process.exit(1);
}
if (TEST_DATABASE_URL === DATABASE_URL) {
  console.error(
    "FATAL: TEST_DATABASE_URL equals DATABASE_URL. Refusing to run data tests against a non-test database."
  );
  process.exit(1);
}
if (process.env.NODE_ENV !== "test") {
  console.error("FATAL: NODE_ENV must be 'test' to run data tests (mailer would call Resend otherwise).");
  process.exit(1);
}

const { Pool } = pg;
const pool = new Pool({ connectionString: TEST_DATABASE_URL });

const { createApp } = await import("../app.js");

const app = createApp(pool);
const server = http.createServer(app);

let baseUrl;

before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

function uniqueEmail(label) {
  return `${label}.${process.hrtime.bigint()}@data-test.local`;
}

function sha256(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function makeUser(role, label) {
  const email = uniqueEmail(label);
  const { rows } = await pool.query(
    `INSERT INTO users (email, name, role) VALUES ($1, $2, $3) RETURNING id, email`,
    [email, label, role]
  );
  return rows[0];
}

// Signs a user in directly (bypasses the magic-link flow -- already covered
// by auth.test.js) by inserting a session row and returning its raw token.
async function signIn(user) {
  const raw = crypto.randomBytes(32).toString("base64url");
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 day')`,
    [user.id, sha256(raw)]
  );
  return raw;
}

function authHeaders(cookie) {
  return { cookie: `wh_session=${cookie}` };
}

async function makeWorkoutAssignment(user) {
  const { rows: workoutRows } = await pool.query(
    `INSERT INTO workouts (created_by, title) VALUES ($1, $2) RETURNING id`,
    [user.id, "Test workout"]
  );
  const { rows: assignmentRows } = await pool.query(
    `INSERT INTO workout_assignments (user_id, workout_id, scheduled_for, assigned_by)
     VALUES ($1, $2, $3, $1) RETURNING id`,
    [user.id, workoutRows[0].id, "2026-09-05"]
  );
  return assignmentRows[0].id;
}

test("bootstrap: returns exactly the session user's data, shape matches spec, no cross-leak", async () => {
  const userA = await makeUser("user", "bootA");
  const userB = await makeUser("user", "bootB");

  await pool.query(
    `INSERT INTO checkins (user_id, day, score, answers) VALUES ($1, '2026-09-01', 80, $2)`,
    [userA.id, { hours: 7, sleep: 3, soreness: 1, energy: 2, stress: 1, fuel: 2, drive: 3 }]
  );
  await pool.query(`INSERT INTO checkins (user_id, day, score, answers) VALUES ($1, '2026-09-01', 10, '{}')`, [
    userB.id,
  ]);

  await pool.query(
    `INSERT INTO fuel_logs (user_id, eaten_on, name, calories, protein_g, carbs_g, fat_g, source)
     VALUES ($1, '2026-09-01', 'Chicken breast', 220, 40, 0, 5, 'custom')`,
    [userA.id]
  );
  await pool.query(
    `INSERT INTO fuel_logs (user_id, eaten_on, name, calories, protein_g, carbs_g, fat_g, source)
     VALUES ($1, '2026-09-01', 'B-only food', 500, 1, 1, 1, 'custom')`,
    [userB.id]
  );

  const { rows: logRows } = await pool.query(
    `INSERT INTO workout_logs (user_id, performed_at, notes) VALUES ($1, '2026-09-01T10:00:00Z', 'felt good')
     RETURNING id`,
    [userA.id]
  );
  await pool.query(
    `INSERT INTO workout_log_sets (user_id, log_id, exercise_key, set_no, reps, weight_lbs, rpe)
     VALUES ($1, $2, 'bench_press', 1, 8, 135, 7.5)`,
    [userA.id, logRows[0].id]
  );

  await pool.query(`UPDATE users SET profile = '{"bodyweight": 180}' WHERE id = $1`, [userA.id]);

  const cookieA = await signIn(userA);
  const res = await fetch(`${baseUrl}/api/bootstrap`, { headers: authHeaders(cookieA) });
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.user.id, userA.id);
  assert.equal(body.user.email, userA.email);
  assert.equal(body.user.role, "user");
  assert.deepEqual(body.profile, { bodyweight: 180 });

  assert.equal(body.checkins.length, 1);
  assert.equal(body.checkins[0].day.slice(0, 10), "2026-09-01");
  assert.equal(body.checkins[0].score, 80);
  assert.equal(body.checkins[0].answers.hours, 7);

  assert.equal(body.fuel.length, 1);
  assert.equal(body.fuel[0].name, "Chicken breast");
  assert.equal(body.fuel[0].calories, 220);
  assert.ok(!body.fuel.some((f) => f.name === "B-only food"), "user B's fuel never appears");

  assert.equal(body.workoutLogs.length, 1);
  assert.equal(body.workoutLogs[0].notes, "felt good");
  assert.equal(body.workoutLogs[0].sets.length, 1);
  assert.equal(body.workoutLogs[0].sets[0].exercise_key, "bench_press");
  assert.equal(body.workoutLogs[0].sets[0].reps, 8);
});

test("checkin POST twice same day upserts: one row, second wins", async () => {
  const user = await makeUser("user", "checkinUpsert");
  const cookie = await signIn(user);

  const first = await fetch(`${baseUrl}/api/checkins`, {
    method: "POST",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify({ day: "2026-09-02", score: 50, answers: { drive: 1 } }),
  });
  assert.equal(first.status, 200);

  const second = await fetch(`${baseUrl}/api/checkins`, {
    method: "POST",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify({ day: "2026-09-02", score: 90, answers: { drive: 3 } }),
  });
  assert.equal(second.status, 200);
  const body = await second.json();
  assert.equal(body.score, 90);
  assert.equal(body.answers.drive, 3);

  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM checkins WHERE user_id = $1 AND day = $2`, [
    user.id,
    "2026-09-02",
  ]);
  assert.equal(rows[0].n, 1, "exactly one row after both upserts");
});

test("fuel insert + delete own row; delete other user's row id -> 404, row survives", async () => {
  const userA = await makeUser("user", "fuelA");
  const userB = await makeUser("user", "fuelB");
  const cookieA = await signIn(userA);
  const cookieB = await signIn(userB);

  const insertRes = await fetch(`${baseUrl}/api/fuel-logs`, {
    method: "POST",
    headers: { ...authHeaders(cookieA), "content-type": "application/json" },
    body: JSON.stringify({
      eaten_on: "2026-09-02",
      name: "Oats",
      calories: 300,
      protein_g: 10,
      carbs_g: 50,
      fat_g: 5,
      source: "custom",
    }),
  });
  assert.equal(insertRes.status, 201);
  const inserted = await insertRes.json();
  assert.ok(inserted.id);

  // User B cannot delete user A's row.
  const crossDelete = await fetch(`${baseUrl}/api/fuel-logs/${inserted.id}`, {
    method: "DELETE",
    headers: authHeaders(cookieB),
  });
  assert.equal(crossDelete.status, 404);

  const { rows: survives } = await pool.query(`SELECT 1 FROM fuel_logs WHERE id = $1`, [inserted.id]);
  assert.equal(survives.length, 1, "row survives the cross-user delete attempt");

  // User A deletes their own row: 200, then repeat delete: 404.
  const ownDelete = await fetch(`${baseUrl}/api/fuel-logs/${inserted.id}`, {
    method: "DELETE",
    headers: authHeaders(cookieA),
  });
  assert.equal(ownDelete.status, 200);

  const repeatDelete = await fetch(`${baseUrl}/api/fuel-logs/${inserted.id}`, {
    method: "DELETE",
    headers: authHeaders(cookieA),
  });
  assert.equal(repeatDelete.status, 404);
});

test("workout-log transaction: bad set (set_no 0) -> 400, log NOT inserted", async () => {
  const user = await makeUser("user", "badSet");
  const cookie = await signIn(user);

  const { rows: before } = await pool.query(`SELECT count(*)::int AS n FROM workout_logs WHERE user_id = $1`, [
    user.id,
  ]);

  const res = await fetch(`${baseUrl}/api/workout-logs`, {
    method: "POST",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify({
      performed_at: "2026-09-02T10:00:00Z",
      sets: [{ exercise_key: "squat", set_no: 0, reps: 5 }],
    }),
  });
  assert.equal(res.status, 400);

  const { rows: after } = await pool.query(`SELECT count(*)::int AS n FROM workout_logs WHERE user_id = $1`, [
    user.id,
  ]);
  assert.equal(after[0].n, before[0].n, "no workout_logs row inserted");
});

test("workout-log with another user's assignment_id -> 400 (composite FK), nothing inserted", async () => {
  const userA = await makeUser("user", "assignA");
  const userB = await makeUser("user", "assignB");
  const assignmentIdForA = await makeWorkoutAssignment(userA);
  const cookieB = await signIn(userB);

  const { rows: before } = await pool.query(`SELECT count(*)::int AS n FROM workout_logs WHERE user_id = $1`, [
    userB.id,
  ]);

  const res = await fetch(`${baseUrl}/api/workout-logs`, {
    method: "POST",
    headers: { ...authHeaders(cookieB), "content-type": "application/json" },
    body: JSON.stringify({
      performed_at: "2026-09-02T10:00:00Z",
      assignment_id: assignmentIdForA,
      sets: [{ exercise_key: "squat", set_no: 1, reps: 5 }],
    }),
  });
  assert.equal(res.status, 400);

  const { rows: after } = await pool.query(`SELECT count(*)::int AS n FROM workout_logs WHERE user_id = $1`, [
    userB.id,
  ]);
  assert.equal(after[0].n, before[0].n, "no workout_logs row inserted");
});

test("profile PATCH merges fields across two calls, rejects unknown keys", async () => {
  const user = await makeUser("user", "profileMerge");
  const cookie = await signIn(user);

  const first = await fetch(`${baseUrl}/api/profile`, {
    method: "PATCH",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify({ bodyweight: 175 }),
  });
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { bodyweight: 175 });

  const second = await fetch(`${baseUrl}/api/profile`, {
    method: "PATCH",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify({ coach: "Kyle" }),
  });
  assert.equal(second.status, 200);
  const merged = await second.json();
  assert.equal(merged.bodyweight, 175, "earlier field survives the merge");
  assert.equal(merged.coach, "Kyle");

  const rejected = await fetch(`${baseUrl}/api/profile`, {
    method: "PATCH",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify({ notAllowed: true }),
  });
  assert.equal(rejected.status, 400);
});

test("import happy path: realistic dump -> counts correct, rows correct, kcal mapped, profile merged", async () => {
  const user = await makeUser("user", "importHappy");
  const cookie = await signIn(user);

  const dump = {
    checkins: {
      "2026-08-30": { score: 70, answers: { hours: 7, sleep: 3, soreness: 1, energy: 2, stress: 1, fuel: 2, drive: 2 } },
      "2026-08-31": { score: 85, answers: { hours: 8, sleep: 3, soreness: 0, energy: 3, stress: 0, fuel: 3, drive: 3 } },
      "2026-09-01": { score: 60, answers: { hours: 6, sleep: 2, soreness: 2, energy: 1, stress: 2, fuel: 1, drive: 1 } },
    },
    fuelLog: {
      "2026-08-30": [
        { id: "f1", name: "Protein bar", brand: "Quest", kcal: 190, protein: 21, carbs: 15, fat: 8 },
        { id: "f2", name: "Banana", kcal: 105, protein: 1.3, carbs: 27, fat: 0.4 },
      ],
      "2026-08-31": [{ id: "f3", name: "Mystery shake", kcal: 250 }],
    },
    bodyweight: 182,
    coach: "Kyle",
  };

  const res = await fetch(`${baseUrl}/api/import`, {
    method: "POST",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify(dump),
  });
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.imported.checkins, 3);
  assert.equal(body.imported.fuel, 3);
  assert.equal(body.imported.skipped, 0);
  assert.equal(body.profile.bodyweight, 182);
  assert.equal(body.profile.coach, "Kyle");

  const { rows: checkinRows } = await pool.query(
    `SELECT count(*)::int AS n FROM checkins WHERE user_id = $1`,
    [user.id]
  );
  assert.equal(checkinRows[0].n, 3);

  const { rows: fuelRows } = await pool.query(
    `SELECT name, calories, protein_g, carbs_g, fat_g, source, raw FROM fuel_logs WHERE user_id = $1 ORDER BY name`,
    [user.id]
  );
  assert.equal(fuelRows.length, 3);
  const bar = fuelRows.find((r) => r.name === "Protein bar");
  assert.equal(bar.calories, 190, "kcal mapped to calories");
  assert.equal(bar.protein_g, 21);
  assert.equal(bar.source, "custom");
  assert.equal(bar.raw.brand, "Quest", "brand folded into raw jsonb");

  const banana = fuelRows.find((r) => r.name === "Banana");
  assert.equal(banana.protein_g, 1, "protein rounded via Math.round");

  const shake = fuelRows.find((r) => r.name === "Mystery shake");
  assert.equal(shake.calories, 250);
  assert.equal(shake.protein_g, null, "missing macro stays null, no crash");
});

test("import into an account with existing data -> 409, nothing changed", async () => {
  const user = await makeUser("user", "importConflict");
  await pool.query(`INSERT INTO checkins (user_id, day, score, answers) VALUES ($1, '2026-09-01', 50, '{}')`, [
    user.id,
  ]);
  const cookie = await signIn(user);

  const res = await fetch(`${baseUrl}/api/import`, {
    method: "POST",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify({ checkins: { "2026-09-02": { score: 99, answers: {} } } }),
  });
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: "account already has data" });

  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM checkins WHERE user_id = $1`, [user.id]);
  assert.equal(rows[0].n, 1, "still exactly the one pre-existing row");
});

test("all data routes are 401 without a session", async () => {
  const noAuth = { "content-type": "application/json" };

  const bootstrapRes = await fetch(`${baseUrl}/api/bootstrap`);
  assert.equal(bootstrapRes.status, 401);

  const checkinsRes = await fetch(`${baseUrl}/api/checkins`, {
    method: "POST",
    headers: noAuth,
    body: JSON.stringify({ day: "2026-09-02", score: 50, answers: {} }),
  });
  assert.equal(checkinsRes.status, 401);

  const fuelPostRes = await fetch(`${baseUrl}/api/fuel-logs`, {
    method: "POST",
    headers: noAuth,
    body: JSON.stringify({ eaten_on: "2026-09-02", name: "x" }),
  });
  assert.equal(fuelPostRes.status, 401);

  const fuelDeleteRes = await fetch(`${baseUrl}/api/fuel-logs/00000000-0000-0000-0000-000000000000`, {
    method: "DELETE",
  });
  assert.equal(fuelDeleteRes.status, 401);

  const workoutLogRes = await fetch(`${baseUrl}/api/workout-logs`, {
    method: "POST",
    headers: noAuth,
    body: JSON.stringify({ performed_at: "2026-09-02T10:00:00Z", sets: [] }),
  });
  assert.equal(workoutLogRes.status, 401);

  const profileRes = await fetch(`${baseUrl}/api/profile`, {
    method: "PATCH",
    headers: noAuth,
    body: JSON.stringify({ bodyweight: 180 }),
  });
  assert.equal(profileRes.status, 401);

  const importRes = await fetch(`${baseUrl}/api/import`, {
    method: "POST",
    headers: noAuth,
    body: JSON.stringify({}),
  });
  assert.equal(importRes.status, 401);
});
