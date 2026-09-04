// server/test/admin.test.js — Kyle console admin route integration tests
// (U5a, ask 30). Same refuse-to-run guards and in-process boot pattern as
// auth.test.js / data.test.js. Runs ONLY against TEST_DATABASE_URL.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import pg from "pg";

const { TEST_DATABASE_URL, DATABASE_URL } = process.env;

if (!TEST_DATABASE_URL) {
  console.error("FATAL: TEST_DATABASE_URL is not set. Refusing to run admin tests.");
  process.exit(1);
}
if (TEST_DATABASE_URL === DATABASE_URL) {
  console.error(
    "FATAL: TEST_DATABASE_URL equals DATABASE_URL. Refusing to run admin tests against a non-test database."
  );
  process.exit(1);
}
if (process.env.NODE_ENV !== "test") {
  console.error("FATAL: NODE_ENV must be 'test' to run admin tests (mailer would call Resend otherwise).");
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
  return `${label}.${process.hrtime.bigint()}@admin-test.local`;
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

async function makeWorkout(admin, title = "Test workout") {
  const { rows } = await pool.query(
    `INSERT INTO workouts (created_by, title, blocks) VALUES ($1, $2, $3) RETURNING id`,
    [admin.id, title, JSON.stringify([{ exercise_key: "bench_press", sets: [{ reps: 8 }] }])]
  );
  return rows[0].id;
}

async function makeAssignment(user, workoutId, admin, scheduledFor) {
  const { rows } = await pool.query(
    `INSERT INTO workout_assignments (user_id, workout_id, scheduled_for, assigned_by)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [user.id, workoutId, scheduledFor, admin.id]
  );
  return rows[0].id;
}

const validBlocks = [
  { exercise_key: "squat", sets: [{ reps: 5, weight_lbs: 135, rpe: 8 }], rest_sec: 90, note: "pause" },
];

test("admin route sweep: 401 with no session, 404 for a non-admin session", async () => {
  const normal = await makeUser("user", "sweepNormal");
  const normalCookie = await signIn(normal);
  const workoutId = await (async () => {
    const admin = await makeUser("admin", "sweepAdminSetup");
    return makeWorkout(admin);
  })();

  const calls = [
    { method: "GET", path: "/api/admin/users" },
    { method: "GET", path: "/api/admin/workouts" },
    { method: "GET", path: `/api/admin/users/${normal.id}/overview` },
    { method: "POST", path: "/api/admin/workouts", body: { title: "x", blocks: validBlocks } },
    {
      method: "POST",
      path: "/api/admin/assignments",
      body: { user_id: normal.id, workout_id: workoutId, scheduled_for: "2026-09-10" },
    },
    { method: "PATCH", path: "/api/admin/assignments/00000000-0000-0000-0000-000000000000", body: { status: "skipped" } },
  ];

  for (const call of calls) {
    const noAuthRes = await fetch(`${baseUrl}${call.path}`, {
      method: call.method,
      headers: { "content-type": "application/json" },
      body: call.body ? JSON.stringify(call.body) : undefined,
    });
    assert.equal(noAuthRes.status, 401, `${call.method} ${call.path} with no session`);

    const nonAdminRes = await fetch(`${baseUrl}${call.path}`, {
      method: call.method,
      headers: { ...authHeaders(normalCookie), "content-type": "application/json" },
      body: call.body ? JSON.stringify(call.body) : undefined,
    });
    assert.equal(nonAdminRes.status, 404, `${call.method} ${call.path} for a non-admin session`);
  }
});

test("roster: returns all users with correct last_checkin and assignment_count", async () => {
  const admin = await makeUser("admin", "rosterAdmin");
  const athlete = await makeUser("user", "rosterAthlete");
  const adminCookie = await signIn(admin);

  await pool.query(`INSERT INTO checkins (user_id, day, score, answers) VALUES ($1, '2026-09-01', 80, '{}')`, [
    athlete.id,
  ]);
  await pool.query(`INSERT INTO checkins (user_id, day, score, answers) VALUES ($1, '2026-09-03', 90, '{}')`, [
    athlete.id,
  ]);

  const workoutId = await makeWorkout(admin);
  await makeAssignment(athlete, workoutId, admin, "2026-09-05");
  await makeAssignment(athlete, workoutId, admin, "2026-09-06");

  const res = await fetch(`${baseUrl}/api/admin/users`, { headers: authHeaders(adminCookie) });
  assert.equal(res.status, 200);
  const rows = await res.json();

  const row = rows.find((r) => r.id === athlete.id);
  assert.ok(row, "roster includes the athlete");
  assert.equal(row.last_checkin.slice(0, 10), "2026-09-03", "last_checkin is the max day");
  assert.equal(row.assignment_count, 2);

  const adminRow = rows.find((r) => r.id === admin.id);
  assert.ok(adminRow, "roster includes the admin too");
  assert.equal(adminRow.assignment_count, 0);
});

test("overview: 404 on unknown user id; correct shape + only that user's rows for a real one", async () => {
  const admin = await makeUser("admin", "overviewAdmin");
  const userA = await makeUser("user", "overviewA");
  const userB = await makeUser("user", "overviewB");
  const adminCookie = await signIn(admin);

  await pool.query(`INSERT INTO checkins (user_id, day, score, answers) VALUES ($1, '2026-09-01', 70, '{}')`, [
    userA.id,
  ]);
  await pool.query(`INSERT INTO checkins (user_id, day, score, answers) VALUES ($1, '2026-09-01', 20, '{}')`, [
    userB.id,
  ]);

  await pool.query(
    `INSERT INTO fuel_logs (user_id, eaten_on, name, calories, source) VALUES ($1, '2026-09-01', 'A food', 200, 'custom')`,
    [userA.id]
  );

  const { rows: logRows } = await pool.query(
    `INSERT INTO workout_logs (user_id, performed_at, notes) VALUES ($1, '2026-09-01T10:00:00Z', 'good') RETURNING id`,
    [userA.id]
  );
  await pool.query(
    `INSERT INTO workout_log_sets (user_id, log_id, exercise_key, set_no, reps) VALUES ($1, $2, 'squat', 1, 5)`,
    [userA.id, logRows[0].id]
  );

  const workoutId = await makeWorkout(admin, "Overview workout");
  await makeAssignment(userA, workoutId, admin, "2026-09-20"); // upcoming
  await makeAssignment(userA, workoutId, admin, "2026-08-01"); // past

  const notFoundRes = await fetch(`${baseUrl}/api/admin/users/00000000-0000-0000-0000-000000000000/overview`, {
    headers: authHeaders(adminCookie),
  });
  assert.equal(notFoundRes.status, 404);

  const res = await fetch(`${baseUrl}/api/admin/users/${userA.id}/overview`, {
    headers: authHeaders(adminCookie),
  });
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.user.id, userA.id);
  assert.equal(body.user.email, userA.email);

  assert.equal(body.checkins.length, 1);
  assert.equal(body.checkins[0].score, 70);
  assert.ok(!body.checkins.some((c) => c.score === 20), "user B's checkin never appears");

  assert.equal(body.fuel.length, 1);
  assert.equal(body.fuel[0].name, "A food");

  assert.equal(body.workoutLogs.length, 1);
  assert.equal(body.workoutLogs[0].sets.length, 1);
  assert.equal(body.workoutLogs[0].sets[0].exercise_key, "squat");

  assert.equal(body.assignments.length, 2);
  assert.ok(body.assignments.some((a) => a.scheduled_for.slice(0, 10) === "2026-09-20"));
  assert.ok(body.assignments.some((a) => a.scheduled_for.slice(0, 10) === "2026-08-01"));
  assert.ok(
    body.assignments.every((a) => a.workout.title === "Overview workout"),
    "workout title joined onto every assignment"
  );
});

test("workout create: happy path; 400 on empty title, empty blocks entry, reps 0, unknown extra shape", async () => {
  const admin = await makeUser("admin", "workoutAdmin");
  const cookie = await signIn(admin);

  const happy = await fetch(`${baseUrl}/api/admin/workouts`, {
    method: "POST",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify({ title: "Push day", notes: "focus tempo", blocks: validBlocks }),
  });
  assert.equal(happy.status, 201);
  const created = await happy.json();
  assert.equal(created.title, "Push day");
  assert.equal(created.created_by, admin.id);
  assert.deepEqual(created.blocks, validBlocks);

  const emptyTitle = await fetch(`${baseUrl}/api/admin/workouts`, {
    method: "POST",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify({ title: "", blocks: validBlocks }),
  });
  assert.equal(emptyTitle.status, 400);

  const emptyBlockEntry = await fetch(`${baseUrl}/api/admin/workouts`, {
    method: "POST",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify({ title: "x", blocks: [{ exercise_key: "squat", sets: [] }] }),
  });
  assert.equal(emptyBlockEntry.status, 400);

  const badReps = await fetch(`${baseUrl}/api/admin/workouts`, {
    method: "POST",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify({ title: "x", blocks: [{ exercise_key: "squat", sets: [{ reps: 0 }] }] }),
  });
  assert.equal(badReps.status, 400);

  const unknownShape = await fetch(`${baseUrl}/api/admin/workouts`, {
    method: "POST",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify({ title: "x", blocks: [{ foo: "bar" }] }),
  });
  assert.equal(unknownShape.status, 400);
});

test("assignment: happy path; 404 unknown user; 404 unknown workout; 409 duplicate; PATCH skipped ok, completed 400", async () => {
  const admin = await makeUser("admin", "assignAdmin");
  const athlete = await makeUser("user", "assignAthlete");
  const cookie = await signIn(admin);
  const workoutId = await makeWorkout(admin);

  const happy = await fetch(`${baseUrl}/api/admin/assignments`, {
    method: "POST",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify({ user_id: athlete.id, workout_id: workoutId, scheduled_for: "2026-09-15" }),
  });
  assert.equal(happy.status, 201);
  const created = await happy.json();
  assert.equal(created.status, "assigned");
  assert.equal(created.assigned_by, admin.id);

  const unknownUser = await fetch(`${baseUrl}/api/admin/assignments`, {
    method: "POST",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify({
      user_id: "00000000-0000-0000-0000-000000000000",
      workout_id: workoutId,
      scheduled_for: "2026-09-16",
    }),
  });
  assert.equal(unknownUser.status, 404);

  const unknownWorkout = await fetch(`${baseUrl}/api/admin/assignments`, {
    method: "POST",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify({
      user_id: athlete.id,
      workout_id: "00000000-0000-0000-0000-000000000000",
      scheduled_for: "2026-09-16",
    }),
  });
  assert.equal(unknownWorkout.status, 404);

  const duplicate = await fetch(`${baseUrl}/api/admin/assignments`, {
    method: "POST",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify({ user_id: athlete.id, workout_id: workoutId, scheduled_for: "2026-09-15" }),
  });
  assert.equal(duplicate.status, 409);

  const patchSkipped = await fetch(`${baseUrl}/api/admin/assignments/${created.id}`, {
    method: "PATCH",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify({ status: "skipped" }),
  });
  assert.equal(patchSkipped.status, 200);
  const patched = await patchSkipped.json();
  assert.equal(patched.status, "skipped");

  const patchCompleted = await fetch(`${baseUrl}/api/admin/assignments/${created.id}`, {
    method: "PATCH",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify({ status: "completed" }),
  });
  assert.equal(patchCompleted.status, 400);

  const patchUnknown = await fetch(`${baseUrl}/api/admin/assignments/00000000-0000-0000-0000-000000000000`, {
    method: "PATCH",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify({ status: "skipped" }),
  });
  assert.equal(patchUnknown.status, 404);
});
