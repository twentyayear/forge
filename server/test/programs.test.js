// server/test/programs.test.js -- W.2 programs, enrolment, bulk assign and
// calendar integration tests. Same refuse-to-run guards and in-process boot
// pattern as admin.test.js. Runs ONLY against TEST_DATABASE_URL.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import pg from "pg";
import { makeTrainer, makeClient, signIn as signInWith, authHeaders } from "./helpers.js";

const { TEST_DATABASE_URL, DATABASE_URL } = process.env;

if (!TEST_DATABASE_URL) {
  console.error("FATAL: TEST_DATABASE_URL is not set. Refusing to run programs tests.");
  process.exit(1);
}
if (TEST_DATABASE_URL === DATABASE_URL) {
  console.error("FATAL: TEST_DATABASE_URL equals DATABASE_URL. Refusing to run programs tests against a non-test database.");
  process.exit(1);
}
if (process.env.NODE_ENV !== "test") {
  console.error("FATAL: NODE_ENV must be 'test' to run programs tests (mailer would call Resend otherwise).");
  process.exit(1);
}

const { Pool } = pg;
const pool = new Pool({ connectionString: TEST_DATABASE_URL });
const { createApp } = await import("../app.js");

const server = http.createServer(createApp(pool));
let baseUrl;
let kyle, trainerB, c1, c2, c3, cB, w1, w2, wB, kyleCookie, bCookie;

async function makeWorkout(owner, title) {
  const { rows } = await pool.query(
    `INSERT INTO workouts (created_by, title, blocks) VALUES ($1, $2, $3) RETURNING id`,
    [owner.id, title, JSON.stringify([{ exercise_key: "squat", sets: [{ reps: 5 }] }])]
  );
  return rows[0].id;
}

before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  kyle = await makeTrainer(pool, "Kyle");
  trainerB = await makeTrainer(pool, "TrainerB");
  c1 = await makeClient(pool, kyle, "c1");
  c2 = await makeClient(pool, kyle, "c2");
  c3 = await makeClient(pool, kyle, "c3");
  cB = await makeClient(pool, trainerB, "cB");
  w1 = await makeWorkout(kyle, "Push");
  w2 = await makeWorkout(kyle, "Pull");
  wB = await makeWorkout(trainerB, "B workout");
  kyleCookie = await signInWith(pool, kyle);
  bCookie = await signInWith(pool, trainerB);
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function call(method, path, cookie, body) {
  const init = { method, headers: { ...authHeaders(cookie) } };
  if (body !== undefined) {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${baseUrl}${path}`, init);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // empty body (204)
  }
  return { status: res.status, json };
}

const kyleCall = (m, p, b) => call(m, p, kyleCookie, b);
const bCall = (m, p, b) => call(m, p, bCookie, b);
const n = async (sql, params) => (await pool.query(sql, params)).rows[0].n;
const programCount = () => n(`SELECT count(*)::int AS n FROM programs`);

// 2030-01-07 is a Monday.
const MONDAY = "2030-01-07";
const SUNDAY = "2030-01-13";

function fourDays() {
  return [
    { day_index: 0, workout_id: w1 },
    { day_index: 1, workout_id: w2 },
    { day_index: 2, workout_id: null, note: "rest" },
    { day_index: 3, workout_id: w1 },
  ];
}

async function makeProgram(title = "Four day") {
  const r = await kyleCall("POST", "/api/admin/programs", { title, days: fourDays() });
  assert.equal(r.status, 201);
  return r.json;
}

test("create: 201 echoes days in order; validation 400s; foreign workout 404 writes nothing", async () => {
  const r = await kyleCall("POST", "/api/admin/programs", {
    title: "Echo",
    description: "d",
    days: [
      { day_index: 3, workout_id: w1 },
      { day_index: 0, workout_id: w2, note: "go" },
    ],
  });
  assert.equal(r.status, 201);
  assert.equal(r.json.title, "Echo");
  assert.deepEqual(r.json.days.map((d) => d.day_index), [0, 3]);
  assert.equal(r.json.days[0].workout_title, "Pull");
  assert.equal(r.json.days[0].note, "go");

  const before = await programCount();
  const bad = [
    { title: "", days: [] },
    { title: "x", days: Array.from({ length: 367 }, (_, i) => ({ day_index: i % 366, workout_id: null })) },
    { title: "x", days: [{ day_index: 1, workout_id: null }, { day_index: 1, workout_id: null }] },
    { title: "x", days: [{ day_index: 366, workout_id: null }] },
    { title: "x", days: [{ day_index: 1, workout_id: 5 }] },
    { title: "x", days: [{ day_index: 1, workout_id: null, note: "n".repeat(501) }] },
    { title: "x", days: "nope" },
  ];
  for (const body of bad) {
    const b = await kyleCall("POST", "/api/admin/programs", body);
    assert.equal(b.status, 400, JSON.stringify(body).slice(0, 80));
    assert.deepEqual(b.json, { error: "invalid_body" });
  }
  const foreign = await kyleCall("POST", "/api/admin/programs", { title: "x", days: [{ day_index: 0, workout_id: wB }] });
  assert.equal(foreign.status, 404);
  assert.equal(await programCount(), before);
});

test("list and get: counts for Kyle; B sees nothing and 404s on Kyle's id", async () => {
  const p = await makeProgram("Listed");
  const list = await kyleCall("GET", "/api/admin/programs");
  assert.equal(list.status, 200);
  const row = list.json.find((x) => x.id === p.id);
  assert.equal(row.day_count, 4);
  assert.equal(row.session_count, 3);
  assert.equal(row.enrollment_count, 0);

  const bList = await bCall("GET", "/api/admin/programs");
  assert.deepEqual(bList.json, []);
  assert.equal((await bCall("GET", `/api/admin/programs/${p.id}`)).status, 404);

  const got = await kyleCall("GET", `/api/admin/programs/${p.id}`);
  assert.equal(got.status, 200);
  assert.deepEqual(got.json.days.map((d) => d.day_index), [0, 1, 2, 3]);
  assert.deepEqual(got.json.enrollments, []);
});

test("patch: title persists, days replaced; B's patch is 404 and changes nothing", async () => {
  const p = await makeProgram("Patchme");
  const r = await kyleCall("PATCH", `/api/admin/programs/${p.id}`, {
    title: "Renamed",
    days: [{ day_index: 5, workout_id: w2 }],
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.title, "Renamed");
  assert.deepEqual(r.json.days.map((d) => d.day_index), [5]);
  assert.equal(await n(`SELECT count(*)::int AS n FROM program_days WHERE program_id = $1`, [p.id]), 1);

  const b = await bCall("PATCH", `/api/admin/programs/${p.id}`, { title: "Hacked", days: [] });
  assert.equal(b.status, 404);
  const after = await kyleCall("GET", `/api/admin/programs/${p.id}`);
  assert.equal(after.json.title, "Renamed");
  assert.equal(after.json.days.length, 1);
});

test("enrol: assignments on Mon/Tue/Thu, idempotent, foreign client 404, manual row not duplicated", async () => {
  const p = await makeProgram("Enrol");
  const ids = [c1.id, c2.id, c3.id];
  const r = await kyleCall("POST", `/api/admin/programs/${p.id}/enroll`, { user_ids: ids, start_date: MONDAY });
  assert.equal(r.status, 200);
  assert.equal(r.json.enrolled.length, 3);
  assert.deepEqual(r.json.skipped, []);
  assert.equal(r.json.assignments_created, 9);

  const { rows } = await pool.query(
    `SELECT wa.user_id, to_char(wa.scheduled_for,'YYYY-MM-DD') AS d, wa.assigned_by, wa.program_enrollment_id
     FROM workout_assignments wa JOIN program_enrollments pe ON pe.id = wa.program_enrollment_id
     WHERE pe.program_id = $1`,
    [p.id]
  );
  assert.equal(rows.length, 9);
  for (const id of ids) {
    const days = rows.filter((x) => x.user_id === id).map((x) => x.d).sort();
    assert.deepEqual(days, ["2030-01-07", "2030-01-08", "2030-01-10"]);
  }
  assert.ok(rows.every((x) => x.assigned_by === kyle.id && x.program_enrollment_id));

  const again = await kyleCall("POST", `/api/admin/programs/${p.id}/enroll`, { user_ids: ids, start_date: MONDAY });
  assert.equal(again.status, 200);
  assert.equal(again.json.skipped.length, 3);
  assert.equal(again.json.assignments_created, 0);
  assert.equal(
    await n(
      `SELECT count(*)::int AS n FROM workout_assignments wa JOIN program_enrollments pe ON pe.id = wa.program_enrollment_id WHERE pe.program_id = $1`,
      [p.id]
    ),
    9
  );

  const enrBefore = await n(`SELECT count(*)::int AS n FROM program_enrollments`);
  const asgBefore = await n(`SELECT count(*)::int AS n FROM workout_assignments`);
  const foreign = await kyleCall("POST", `/api/admin/programs/${p.id}/enroll`, {
    user_ids: [c1.id, cB.id],
    start_date: "2030-02-04",
  });
  assert.equal(foreign.status, 404);
  assert.equal(await n(`SELECT count(*)::int AS n FROM program_enrollments`), enrBefore);
  assert.equal(await n(`SELECT count(*)::int AS n FROM workout_assignments`), asgBefore);

  // MANUAL ROW FIRST, THEN ENROL FROM A DIFFERENT START: DAY 0 COLLIDES WITH THE MANUAL ASSIGNMENT.
  const start = "2030-03-04";
  await pool.query(
    `INSERT INTO workout_assignments (user_id, workout_id, scheduled_for, assigned_by) VALUES ($1, $2, $3, $4)`,
    [c1.id, w1, start, kyle.id]
  );
  const manual = await kyleCall("POST", `/api/admin/programs/${p.id}/enroll`, { user_ids: [c1.id], start_date: start });
  assert.equal(manual.status, 200);
  assert.equal(manual.json.enrolled.length, 1);
  assert.equal(manual.json.assignments_created, 2);
  assert.equal(
    await n(`SELECT count(*)::int AS n FROM workout_assignments WHERE user_id = $1 AND workout_id = $2 AND scheduled_for = $3`, [c1.id, w1, start]),
    1
  );
});

test("bulk assign: created, then skipped; B's workout 404", async () => {
  const date = "2030-04-01";
  const r = await kyleCall("POST", "/api/admin/assignments/bulk", { workout_id: w2, user_ids: [c1.id, c2.id], scheduled_for: date });
  assert.equal(r.status, 200);
  assert.equal(r.json.created.length, 2);
  const again = await kyleCall("POST", "/api/admin/assignments/bulk", { workout_id: w2, user_ids: [c1.id, c2.id], scheduled_for: date });
  assert.equal(again.json.skipped.length, 2);
  assert.deepEqual(again.json.created, []);
  const foreign = await kyleCall("POST", "/api/admin/assignments/bulk", { workout_id: wB, user_ids: [c1.id], scheduled_for: date });
  assert.equal(foreign.status, 404);
});

test("calendar: week returns the enrolled rows with program_title; B empty; 70 days is 400", async () => {
  // ISOLATED CLIENTS AND A DATE RANGE NO OTHER TEST USES, SO THE COUNT IS EXACT.
  const t = await makeTrainer(pool, "CalTrainer");
  const k1 = await makeClient(pool, t, "k1");
  const k2 = await makeClient(pool, t, "k2");
  const k3 = await makeClient(pool, t, "k3");
  const wk = await makeWorkout(t, "Cal workout");
  const cookie = await signInWith(pool, t);
  const prog = await call("POST", "/api/admin/programs", cookie, {
    title: "Cal",
    days: [
      { day_index: 0, workout_id: wk },
      { day_index: 1, workout_id: wk },
      { day_index: 2, workout_id: null },
      { day_index: 3, workout_id: wk },
    ],
  });
  const enr = await call("POST", `/api/admin/programs/${prog.json.id}/enroll`, cookie, {
    user_ids: [k1.id, k2.id, k3.id],
    start_date: "2031-01-06",
  });
  assert.equal(enr.json.assignments_created, 9);
  const r = await call("GET", "/api/admin/calendar?from=2031-01-06&to=2031-01-12", cookie);
  assert.equal(r.status, 200);
  assert.equal(r.json.length, 9);
  assert.ok(r.json.every((x) => x.program_title === "Cal" && x.workout_title === "Cal workout"));

  const b = await bCall("GET", "/api/admin/calendar?from=2031-01-06&to=2031-01-12");
  assert.deepEqual(b.json, []);
  assert.equal((await kyleCall("GET", "/api/admin/calendar?from=2031-01-01&to=2031-03-12")).status, 400);
  assert.equal((await kyleCall("GET", "/api/admin/calendar?from=2031-01-12&to=2031-01-06")).status, 400);
  assert.equal((await kyleCall("GET", "/api/admin/calendar?from=2031-01-06")).status, 400);
});

test("delete: 409 with enrolments (still present); 204 for a fresh program (days gone)", async () => {
  const enrolled = await makeProgram("Has enrolments");
  await kyleCall("POST", `/api/admin/programs/${enrolled.id}/enroll`, { user_ids: [c3.id], start_date: "2030-06-03" });
  const blocked = await kyleCall("DELETE", `/api/admin/programs/${enrolled.id}`);
  assert.equal(blocked.status, 409);
  assert.deepEqual(blocked.json, { error: "has_enrollments" });
  assert.equal(await n(`SELECT count(*)::int AS n FROM programs WHERE id = $1`, [enrolled.id]), 1);

  const fresh = await makeProgram("Fresh");
  const ok = await kyleCall("DELETE", `/api/admin/programs/${fresh.id}`);
  assert.equal(ok.status, 204);
  assert.equal(await n(`SELECT count(*)::int AS n FROM programs WHERE id = $1`, [fresh.id]), 0);
  assert.equal(await n(`SELECT count(*)::int AS n FROM program_days WHERE program_id = $1`, [fresh.id]), 0);
});

test("bootstrap: enrolled assignment carries program_title, manual one carries null", async () => {
  const t = await makeTrainer(pool, "BootTrainer");
  const client = await makeClient(pool, t, "boot");
  const wk = await makeWorkout(t, "Boot workout");
  const wk2 = await makeWorkout(t, "Boot manual");
  const tCookie = await signInWith(pool, t);
  const prog = await call("POST", "/api/admin/programs", tCookie, { title: "Boot prog", days: [{ day_index: 0, workout_id: wk }] });
  const today = new Date().toISOString().slice(0, 10);
  const enr = await call("POST", `/api/admin/programs/${prog.json.id}/enroll`, tCookie, { user_ids: [client.id], start_date: today });
  assert.equal(enr.json.assignments_created, 1);
  await pool.query(
    `INSERT INTO workout_assignments (user_id, workout_id, scheduled_for, assigned_by) VALUES ($1, $2, $3, $4)`,
    [client.id, wk2, today, t.id]
  );
  const cCookie = await signInWith(pool, client);
  const r = await call("GET", "/api/bootstrap", cCookie);
  assert.equal(r.status, 200);
  const byTitle = Object.fromEntries(r.json.assignments.map((a) => [a.workout.title, a.program_title]));
  assert.equal(byTitle["Boot workout"], "Boot prog");
  assert.equal(byTitle["Boot manual"], null);
});
