// server/test/admin.test.js — Kyle console admin route integration tests
// (U5a, ask 30). Same refuse-to-run guards and in-process boot pattern as
// auth.test.js / data.test.js. Runs ONLY against TEST_DATABASE_URL.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import pg from "pg";
import { makeTrainer, makeClient, signIn as signInWith, authHeaders, uniqueEmail } from "./helpers.js";

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
const { outbox } = await import("../mail.js");

const signIn = (user) => signInWith(pool, user);

// ONE TRAINER PER FILE: EVERY CLIENT ROW MUST HAVE A TRAINER, AND MOST TESTS DO NOT CARE WHICH.
let trainer;

before(async () => {
  trainer = await makeTrainer(pool, "fileTrainer");
});

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
  const normal = await makeClient(pool, trainer, "sweepNormal");
  const normalCookie = await signIn(normal);
  const workoutId = await (async () => {
    const admin = await makeTrainer(pool, "sweepAdminSetup");
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
  const admin = await makeTrainer(pool, "rosterAdmin");
  const athlete = await makeClient(pool, admin, "rosterAthlete");
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

  assert.ok(!rows.some((r) => r.id === admin.id), "roster lists only the trainer's clients, never the trainer");
});

test("overview: 404 on unknown user id; correct shape + only that user's rows for a real one", async () => {
  const admin = await makeTrainer(pool, "overviewAdmin");
  const userA = await makeClient(pool, admin, "overviewA");
  const userB = await makeClient(pool, admin, "overviewB");
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
  const admin = await makeTrainer(pool, "workoutAdmin");
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
  const admin = await makeTrainer(pool, "assignAdmin");
  const athlete = await makeClient(pool, admin, "assignAthlete");
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

// ---- W.1 trainer tenancy ----

async function api(method, path, cookie, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // empty body
  }
  return { status: res.status, json };
}

// KYLE WITH ONE CLIENT, WORKOUT, ASSIGNMENT AND PENDING DRAFT, PLUS AN UNRELATED TRAINER B WITH ONE CLIENT AND WORKOUT.
async function tenancyFixture(label) {
  const kyle = await makeTrainer(pool, `${label}Kyle`);
  const kyleClient = await makeClient(pool, kyle, `${label}KyleClient`);
  const kyleWorkout = await makeWorkout(kyle, "Kyle only");
  const kyleAssignment = await makeAssignment(kyleClient, kyleWorkout, kyle, "2026-09-20");
  const { rows: draftRows } = await pool.query(
    `INSERT INTO ai_drafts (user_id, trigger_type, body) VALUES ($1, 'manual', 'original draft') RETURNING id`,
    [kyleClient.id]
  );
  const draftId = draftRows[0].id;
  const trainerB = await makeTrainer(pool, `${label}B`);
  const clientB = await makeClient(pool, trainerB, `${label}BClient`);
  const bWorkout = await makeWorkout(trainerB, "B only");
  const cookieB = await signIn(trainerB);
  const cookieKyle = await signIn(kyle);

  // EVERYTHING B COULD TOUCH OF KYLE'S, READ BACK FROM THE DATABASE (NOT THROUGH THE API UNDER TEST).
  const snapshot = async () => ({
    assignment: (await pool.query(`SELECT status FROM workout_assignments WHERE id = $1`, [kyleAssignment])).rows,
    assignmentCount: (
      await pool.query(`SELECT COUNT(*)::int AS n FROM workout_assignments WHERE user_id = $1`, [kyleClient.id])
    ).rows[0].n,
    workoutCount: (
      await pool.query(`SELECT COUNT(*)::int AS n FROM workouts WHERE created_by = $1`, [kyle.id])
    ).rows[0].n,
    draft: (await pool.query(`SELECT body, status, sent_message_id FROM ai_drafts WHERE id = $1`, [draftId])).rows,
    profile: (await pool.query(`SELECT profile FROM users WHERE id = $1`, [kyleClient.id])).rows,
    messages: (await pool.query(`SELECT COUNT(*)::int AS n FROM messages WHERE user_id = $1`, [kyleClient.id])).rows[0]
      .n,
  });
  return { kyle, kyleClient, kyleWorkout, kyleAssignment, draftId, trainerB, clientB, bWorkout, cookieB, cookieKyle, snapshot };
}

test("tenancy: B's roster is only B's client; Kyle's roster still has his", async () => {
  const f = await tenancyFixture("tenRoster");
  const roster = await api("GET", "/api/admin/users", f.cookieB);
  assert.equal(roster.status, 200);
  assert.deepEqual(roster.json.map((r) => r.id), [f.clientB.id]);
  const kyleRoster = await api("GET", "/api/admin/users", f.cookieKyle);
  assert.deepEqual(kyleRoster.json.map((r) => r.id), [f.kyleClient.id]);
});

test("tenancy: B gets 404 on Kyle's client overview and settings; nothing changes", async () => {
  const f = await tenancyFixture("tenOverview");
  const before = await f.snapshot();
  assert.equal((await api("GET", `/api/admin/users/${f.kyleClient.id}/overview`, f.cookieB)).status, 404);
  assert.equal(
    (await api("PATCH", `/api/admin/users/${f.kyleClient.id}/settings`, f.cookieB, { kyleAutoSend: true })).status,
    404
  );
  assert.deepEqual(await f.snapshot(), before);
  assert.equal((await api("GET", `/api/admin/users/${f.kyleClient.id}/overview`, f.cookieKyle)).status, 200);
});

test("tenancy: B cannot assign to Kyle's client or with Kyle's workout; cannot patch Kyle's assignment", async () => {
  const f = await tenancyFixture("tenAssign");
  const before = await f.snapshot();
  const toKyleClient = await api("POST", "/api/admin/assignments", f.cookieB, {
    user_id: f.kyleClient.id,
    workout_id: f.bWorkout,
    scheduled_for: "2026-09-21",
  });
  assert.equal(toKyleClient.status, 404);
  const withKyleWorkout = await api("POST", "/api/admin/assignments", f.cookieB, {
    user_id: f.clientB.id,
    workout_id: f.kyleWorkout,
    scheduled_for: "2026-09-21",
  });
  assert.equal(withKyleWorkout.status, 404);
  const patch = await api("PATCH", `/api/admin/assignments/${f.kyleAssignment}`, f.cookieB, { status: "skipped" });
  assert.equal(patch.status, 404);
  assert.deepEqual(await f.snapshot(), before);
  const own = await api("POST", "/api/admin/assignments", f.cookieB, {
    user_id: f.clientB.id,
    workout_id: f.bWorkout,
    scheduled_for: "2026-09-21",
  });
  assert.equal(own.status, 201, "B can still assign B's own workout to B's own client");
});

test("tenancy: B's workout list never contains Kyle's workouts", async () => {
  const f = await tenancyFixture("tenWorkouts");
  const workouts = await api("GET", "/api/admin/workouts", f.cookieB);
  assert.equal(workouts.status, 200);
  assert.deepEqual(workouts.json.map((w) => w.id), [f.bWorkout]);
});

test("tenancy: B cannot list, edit, approve or reject Kyle's draft; Kyle's draft is unchanged", async () => {
  const f = await tenancyFixture("tenDrafts");
  const before = await f.snapshot();
  const drafts = await api("GET", "/api/admin/drafts", f.cookieB);
  assert.equal(drafts.status, 200);
  assert.ok(!drafts.json.some((d) => d.id === f.draftId));
  assert.equal((await api("PATCH", `/api/admin/drafts/${f.draftId}`, f.cookieB, { body: "hijacked" })).status, 404);
  assert.equal((await api("POST", `/api/admin/drafts/${f.draftId}/approve`, f.cookieB)).status, 404);
  assert.equal((await api("POST", `/api/admin/drafts/${f.draftId}/reject`, f.cookieB)).status, 404);
  assert.deepEqual(await f.snapshot(), before);
  const kyleDrafts = await api("GET", "/api/admin/drafts", f.cookieKyle);
  assert.ok(kyleDrafts.json.some((d) => d.id === f.draftId), "Kyle still sees his draft");
  assert.equal((await api("POST", `/api/admin/drafts/${f.draftId}/reject`, f.cookieKyle)).status, 200);
});

test("add client: 201, row carries the caller as trainer, one magic link in the outbox", async () => {
  const kyle = await makeTrainer(pool, "addKyle");
  const cookie = await signIn(kyle);
  const email = uniqueEmail("NewClient");
  outbox.length = 0;
  const res = await api("POST", "/api/admin/clients", cookie, {
    email: `  ${email.toUpperCase()}  `,
    name: "  New Client ",
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.email, email.toLowerCase());
  assert.equal(res.json.name, "New Client");
  const { rows } = await pool.query(`SELECT trainer_id, role FROM users WHERE id = $1`, [res.json.id]);
  assert.equal(rows[0].trainer_id, kyle.id);
  assert.equal(rows[0].role, "user");
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].email, email.toLowerCase());
  assert.ok(outbox[0].url.includes("/api/auth/verify?token="));
});

test("add client: the new client is in the caller's roster and not in B's", async () => {
  const kyle = await makeTrainer(pool, "rosterAddKyle");
  const trainerB = await makeTrainer(pool, "rosterAddB");
  const res = await api("POST", "/api/admin/clients", await signIn(kyle), {
    email: uniqueEmail("rosterNew"),
    name: "Roster New",
  });
  assert.equal(res.status, 201);
  const mine = await api("GET", "/api/admin/users", await signIn(kyle));
  assert.ok(mine.json.some((r) => r.id === res.json.id));
  const theirs = await api("GET", "/api/admin/users", await signIn(trainerB));
  assert.ok(!theirs.json.some((r) => r.id === res.json.id));
});

test("add client: a duplicate email is 409 for anyone, sends no mail and keeps the original trainer", async () => {
  const kyle = await makeTrainer(pool, "dupKyle");
  const trainerB = await makeTrainer(pool, "dupB");
  const email = uniqueEmail("dupClient");
  const first = await api("POST", "/api/admin/clients", await signIn(kyle), { email, name: "Dup" });
  assert.equal(first.status, 201);
  outbox.length = 0;
  const again = await api("POST", "/api/admin/clients", await signIn(kyle), { email, name: "Again" });
  assert.equal(again.status, 409);
  assert.equal(again.json.error, "exists");
  const steal = await api("POST", "/api/admin/clients", await signIn(trainerB), { email, name: "Steal" });
  assert.equal(steal.status, 409, "the email is global: B cannot take Kyle's client");
  assert.equal(outbox.length, 0);
  const { rows } = await pool.query(`SELECT trainer_id FROM users WHERE id = $1`, [first.json.id]);
  assert.equal(rows[0].trainer_id, kyle.id);
});

test("add client: a bad body is 400 invalid_body and sends no mail", async () => {
  const kyle = await makeTrainer(pool, "badBodyKyle");
  const cookie = await signIn(kyle);
  outbox.length = 0;
  for (const bad of [
    undefined,
    {},
    { email: "no-at-sign", name: "X" },
    { email: uniqueEmail("noname"), name: "   " },
    { email: uniqueEmail("longname"), name: "x".repeat(81) },
    { email: `${"a".repeat(250)}@x.io`, name: "X" },
    { email: 42, name: "X" },
  ]) {
    const r = await api("POST", "/api/admin/clients", cookie, bad);
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.equal(r.json.error, "invalid_body");
  }
  assert.equal(outbox.length, 0);
});

test("add client: a non-admin gets 404 and creates nothing", async () => {
  const email = uniqueEmail("nonadminAdd");
  const res = await api("POST", "/api/admin/clients", await signIn(await makeClient(pool, trainer, "addNormal")), {
    email,
    name: "X",
  });
  assert.equal(res.status, 404);
  const { rows } = await pool.query(`SELECT 1 FROM users WHERE email = $1`, [email]);
  assert.equal(rows.length, 0);
});

// ---- Roster (W.9) ----

// DATES ARE OFFSETS FROM THE DATABASE'S CURRENT_DATE SO THE FIXTURES AGREE WITH THE ROUTE'S OWN CLOCK.
async function dayOffset(n) {
  const { rows } = await pool.query(`SELECT to_char(CURRENT_DATE + $1::int, 'YYYY-MM-DD') AS d`, [n]);
  return rows[0].d;
}

async function assignAt(client, workoutId, trainerRow, offset, status) {
  await pool.query(
    `INSERT INTO workout_assignments (user_id, workout_id, scheduled_for, assigned_by, status)
     VALUES ($1, $2, CURRENT_DATE + $3::int, $4, $5)`,
    [client.id, workoutId, offset, trainerRow.id, status]
  );
}

test("roster: a missed assignment, an unread message and a pending draft surface under needsYou", async () => {
  const t = await makeTrainer(pool, "rosterT");
  const missed = await makeClient(pool, t, "rosterMissed");
  const track = await makeClient(pool, t, "rosterTrack");
  const cookie = await signIn(t);
  const wId = await makeWorkout(t, "Roster Lower");

  await assignAt(missed, wId, t, -2, "assigned");
  await assignAt(track, wId, t, -2, "completed");
  await assignAt(track, wId, t, -1, "completed");
  await assignAt(track, wId, t, 3, "assigned");
  await pool.query(`INSERT INTO messages (user_id, sender, body) VALUES ($1, 'user', 'hi'), ($1, 'user', 'again')`, [track.id]);
  await pool.query(`INSERT INTO ai_drafts (user_id, trigger_type, body) VALUES ($1, 'manual', 'a'), ($2, 'manual', 'b')`, [missed.id, track.id]);
  await pool.query(`INSERT INTO checkins (user_id, day, score, answers) VALUES ($1, CURRENT_DATE, 71, '{}')`, [track.id]);

  const r = await api("GET", "/api/admin/roster", cookie);
  assert.equal(r.status, 200);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${await dayOffset(-2)}T00:00:00Z`).getUTCDay()];
  assert.deepEqual(r.json.needsYou, [
    { kind: "missed", user_id: missed.id, user_name: "rosterMissed", count: 1, detail: wd },
    { kind: "unread", user_id: track.id, user_name: "rosterTrack", count: 2, detail: "" },
    { kind: "drafts", count: 2, detail: "" },
  ]);

  assert.equal(r.json.clients.length, 2);
  const m = r.json.clients.find((c) => c.id === missed.id);
  const k = r.json.clients.find((c) => c.id === track.id);
  assert.equal(m.on_track, false);
  assert.equal(m.next, null);
  assert.equal(m.streak, 0);
  assert.equal(k.on_track, true);
  assert.equal(k.streak, 2);
  assert.deepEqual(k.next, { scheduled_for: await dayOffset(3), title: "Roster Lower" });
  assert.equal(k.readiness_today, 71);
  assert.equal(k.last_checkin, await dayOffset(0));
  assert.equal(k.program_title, null);
  assert.deepEqual(r.json.clients.map((c) => c.name), ["rosterMissed", "rosterTrack"]);
});

test("roster: a missed day older than 7 days does not count; trainer B's roster is empty", async () => {
  const t = await makeTrainer(pool, "rosterOld");
  const c = await makeClient(pool, t, "rosterOldClient");
  const wId = await makeWorkout(t, "Old one");
  await assignAt(c, wId, t, -9, "assigned");
  const cookie = await signIn(t);
  const r = await api("GET", "/api/admin/roster", cookie);
  assert.deepEqual(r.json.needsYou, []);
  assert.equal(r.json.clients[0].on_track, true);

  const b = await makeTrainer(pool, "rosterB");
  const rb = await api("GET", "/api/admin/roster", await signIn(b));
  assert.equal(rb.status, 200);
  assert.deepEqual(rb.json, { needsYou: [], clients: [] });
});

test("roster: another trainer's unread messages and drafts never reach this trainer's needsYou", async () => {
  const a = await makeTrainer(pool, "rosterLeakA");
  const ca = await makeClient(pool, a, "rosterLeakClientA");
  await pool.query(`INSERT INTO messages (user_id, sender, body) VALUES ($1, 'user', 'hello')`, [ca.id]);
  await pool.query(`INSERT INTO ai_drafts (user_id, trigger_type, body) VALUES ($1, 'manual', 'x')`, [ca.id]);
  const b = await makeTrainer(pool, "rosterLeakB");
  const cb = await makeClient(pool, b, "rosterLeakClientB");
  const rb = await api("GET", "/api/admin/roster", await signIn(b));
  assert.deepEqual(rb.json.needsYou, []);
  assert.deepEqual(rb.json.clients.map((c) => c.id), [cb.id]);
  const ra = await api("GET", "/api/admin/roster", await signIn(a));
  assert.deepEqual(ra.json.needsYou.map((e) => e.kind), ["unread", "drafts"]);
});
