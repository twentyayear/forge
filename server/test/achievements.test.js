// server/test/achievements.test.js — W.4: streak helpers, the achievement
// registry, the earned[] on write responses, bootstrap additions.
// Same refuse-to-run guards and boot pattern as data.test.js.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import pg from "pg";
import { makeTrainer, makeClient, signIn, authHeaders } from "./helpers.js";

const { TEST_DATABASE_URL, DATABASE_URL } = process.env;

if (!TEST_DATABASE_URL) {
  console.error("FATAL: TEST_DATABASE_URL is not set. Refusing to run achievements tests.");
  process.exit(1);
}
if (TEST_DATABASE_URL === DATABASE_URL) {
  console.error("FATAL: TEST_DATABASE_URL equals DATABASE_URL. Refusing to run against a non-test database.");
  process.exit(1);
}
if (process.env.NODE_ENV !== "test") {
  console.error("FATAL: NODE_ENV must be 'test' to run achievements tests.");
  process.exit(1);
}

const { Pool } = pg;
const pool = new Pool({ connectionString: TEST_DATABASE_URL });

const { createApp } = await import("../app.js");
const { sessionStreak, checkinStreak, isoWeekKey, epley } = await import("../streaks.js");
const { ACHIEVEMENTS } = await import("../achievements.js");

const server = http.createServer(createApp(pool));
let baseUrl;
let trainer;

before(async () => {
  trainer = await makeTrainer(pool, "achTrainer");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function newClient(label) {
  const user = await makeClient(pool, trainer, label);
  const cookie = await signIn(pool, user);
  return { user, cookie };
}

async function postLog(cookie, body) {
  const res = await fetch(`${baseUrl}/api/workout-logs`, {
    method: "POST",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify({ performed_at: "2026-09-02T10:00:00Z", ...body }),
  });
  return { status: res.status, body: await res.json() };
}

async function postCheckin(cookie, day) {
  const res = await fetch(`${baseUrl}/api/checkins`, {
    method: "POST",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify({ day, score: 70, answers: {} }),
  });
  return { status: res.status, body: await res.json() };
}

async function bootstrap(cookie) {
  const res = await fetch(`${baseUrl}/api/bootstrap`, { headers: authHeaders(cookie) });
  assert.equal(res.status, 200);
  return res.json();
}

const ids = (earned) => earned.map((e) => e.id);
const sets = (exercise_key, reps, weight_lbs) => [{ exercise_key, set_no: 1, reps, weight_lbs }];

async function makeAssignments(user, dates, enrollmentId = null) {
  const { rows: w } = await pool.query(`INSERT INTO workouts (created_by, title) VALUES ($1, 'W') RETURNING id`, [trainer.id]);
  const out = [];
  for (const d of dates) {
    const { rows } = await pool.query(
      `INSERT INTO workout_assignments (user_id, workout_id, scheduled_for, assigned_by, program_enrollment_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [user.id, w[0].id, d, trainer.id, enrollmentId]
    );
    out.push(rows[0].id);
  }
  return out;
}

test("pure helpers: sessionStreak, checkinStreak, isoWeekKey, epley", () => {
  const done = (d) => ({ scheduled_for: d, status: "completed" });
  assert.equal(sessionStreak([done("2026-10-01"), done("2026-10-03"), done("2026-10-02")], "2026-10-05"), 3);
  assert.equal(
    sessionStreak([done("2026-10-01"), { scheduled_for: "2026-10-02", status: "skipped" }, done("2026-10-03"), done("2026-10-04")], "2026-10-05"),
    2
  );
  assert.equal(sessionStreak([done("2026-10-01"), { scheduled_for: "2026-10-09", status: "assigned" }], "2026-10-05"), 1);
  assert.equal(sessionStreak([done("2026-10-01"), { scheduled_for: "2026-10-05", status: "assigned" }], "2026-10-05"), 0);
  assert.equal(sessionStreak([], "2026-10-05"), 0);

  const seven = ["2026-10-05", "2026-10-04", "2026-10-03", "2026-10-02", "2026-10-01", "2026-09-30", "2026-09-29"];
  assert.equal(checkinStreak(seven, "2026-10-05"), 7);
  assert.equal(checkinStreak(["2026-10-05", "2026-10-04", "2026-10-02"], "2026-10-05"), 2);
  assert.equal(checkinStreak(["2026-10-04", "2026-10-03"], "2026-10-05"), 0);

  assert.equal(isoWeekKey("2026-01-01"), "2026-W01");
  assert.equal(isoWeekKey("2027-01-01"), "2026-W53");
  assert.ok(Math.abs(epley(185, 5) - 215.83) < 0.01);
  assert.equal(epley(null, 8), 0);
});

test("first log earns first_session; the second does not", async () => {
  const { cookie } = await newClient("first");
  const a = await postLog(cookie, { sets: sets("squat", 5, 100) });
  assert.equal(a.status, 201);
  assert.ok(ids(a.body.earned).includes("first_session"));
  const b = await postLog(cookie, { sets: sets("squat", 5, 100) });
  assert.ok(!ids(b.body.earned).includes("first_session"));
});

test("3-day program: streak_3, program_complete, week_complete; replay earns nothing", async () => {
  const { user, cookie } = await newClient("program");
  const { rows: p } = await pool.query(`INSERT INTO programs (trainer_id, title) VALUES ($1, 'Test Block') RETURNING id`, [
    trainer.id,
  ]);
  const { rows: e } = await pool.query(
    `INSERT INTO program_enrollments (program_id, user_id, start_date) VALUES ($1, $2, '2026-09-07') RETURNING id`,
    [p[0].id, user.id]
  );
  const [a1, a2, a3] = await makeAssignments(user, ["2026-09-07", "2026-09-08", "2026-09-09"], e[0].id);
  const r1 = await postLog(cookie, { assignment_id: a1, sets: sets("squat", 5, 100) });
  const r2 = await postLog(cookie, { assignment_id: a2, sets: sets("squat", 5, 100) });
  assert.ok(!ids(r1.body.earned).includes("streak_3") && !ids(r2.body.earned).includes("streak_3"));
  const r3 = await postLog(cookie, { assignment_id: a3, sets: sets("squat", 5, 100) });
  assert.equal(r3.status, 201);
  assert.ok(ids(r3.body.earned).includes("streak_3"));
  assert.ok(ids(r3.body.earned).includes("week_complete"));
  const pc = r3.body.earned.find((x) => x.id === "program_complete");
  assert.ok(pc);
  assert.equal(pc.context.program, "Test Block");

  const count = async () =>
    (await pool.query(`SELECT count(*)::int AS n FROM user_achievements WHERE user_id = $1`, [user.id])).rows[0].n;
  const before = await count();
  const replay = await postLog(cookie, { assignment_id: a3, sets: sets("squat", 5, 100) });
  assert.equal(replay.status, 201);
  assert.deepEqual(replay.body.earned, []);
  assert.equal(await count(), before);
});

test("new_pr: first lift is not a PR; a heavier one is; a repeat is not", async () => {
  const { cookie } = await newClient("pr");
  const a = await postLog(cookie, { sets: sets("squat", 5, 175) });
  assert.ok(!ids(a.body.earned).includes("new_pr"));
  const b = await postLog(cookie, { sets: sets("squat", 5, 185) });
  const pr = b.body.earned.find((x) => x.id === "new_pr");
  assert.ok(pr);
  assert.equal(pr.context.exercise, "squat");
  const c = await postLog(cookie, { sets: sets("squat", 5, 185) });
  assert.ok(!ids(c.body.earned).includes("new_pr"));
});

test("volume_10k: 10,000 lb earns it, 9,000 lb does not", async () => {
  const { cookie } = await newClient("vol");
  const small = await postLog(cookie, { sets: sets("deadlift", 10, 900) });
  assert.ok(!ids(small.body.earned).includes("volume_10k"));
  const big = await postLog(cookie, { sets: sets("deadlift", 10, 1000) });
  assert.ok(ids(big.body.earned).includes("volume_10k"));
});

let checkinCookie;
let checkinUser;

test("checkin_streak_7: seventh consecutive day earns it; a re-post earns nothing", async () => {
  const { user, cookie } = await newClient("checkin");
  checkinUser = user;
  checkinCookie = cookie;
  const { rows } = await pool.query(`SELECT (CURRENT_DATE - g)::text AS day FROM generate_series(6, 0, -1) g`);
  let last;
  for (let i = 0; i < rows.length; i++) {
    last = await postCheckin(cookie, rows[i].day);
    assert.equal(last.status, 200);
    if (i < 6) assert.deepEqual(last.body.earned, []);
  }
  assert.ok(ids(last.body.earned).includes("checkin_streak_7"));
  const again = await postCheckin(cookie, rows[6].day);
  assert.equal(again.status, 200);
  assert.deepEqual(again.body.earned, []);
});

test("feel: 'hard' is stored and returned; 'meh' is 400 and writes no log", async () => {
  const { user, cookie } = await newClient("feel");
  const ok = await postLog(cookie, { feel: "hard", sets: sets("squat", 5, 100) });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.feel, "hard");
  const bad = await postLog(cookie, { feel: "meh", sets: sets("squat", 5, 100) });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, "invalid feel");
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM workout_logs WHERE user_id = $1`, [user.id]);
  assert.equal(rows[0].n, 1);
});

test("bootstrap carries achievements, streaks, and feel; tenancy holds", async () => {
  const { user, cookie } = await newClient("boot");
  const dates = ["2026-09-07", "2026-09-08", "2026-09-09"];
  const [a1, a2, a3] = await makeAssignments(user, dates);
  await postLog(cookie, { assignment_id: a1, feel: "easy", sets: sets("squat", 5, 100) });
  await postLog(cookie, { assignment_id: a2, sets: sets("squat", 5, 100) });
  await postLog(cookie, { assignment_id: a3, sets: sets("squat", 5, 100) });
  const b = await bootstrap(cookie);
  const got = b.achievements.map((x) => x.id);
  assert.ok(got.includes("first_session") && got.includes("streak_3"));
  for (const a of b.achievements) {
    assert.ok(a.title && a.blurb && a.dedupe_key && a.earned_at && a.context);
  }
  assert.equal(b.streaks.session, 3);
  assert.equal(b.streaks.checkin, 0);
  assert.ok(b.workoutLogs.every((l) => "feel" in l));
  assert.ok(b.workoutLogs.some((l) => l.feel === "easy"));

  const cb = await bootstrap(checkinCookie);
  assert.equal(cb.streaks.checkin, 7);
  assert.ok(cb.achievements.some((x) => x.id === "checkin_streak_7"));
  assert.ok(!cb.achievements.some((x) => x.id === "first_session"));
  assert.notEqual(checkinUser.id, user.id);
});

test("a throwing rule never fails the write; the other rules still earn", async () => {
  const { cookie } = await newClient("throws");
  const rule = ACHIEVEMENTS.find((a) => a.id === "streak_3");
  const original = rule.evaluate;
  rule.evaluate = () => {
    throw new Error("boom");
  };
  try {
    const r = await postLog(cookie, { sets: sets("squat", 5, 100) });
    assert.equal(r.status, 201);
    assert.ok(ids(r.body.earned).includes("first_session"));
  } finally {
    rule.evaluate = original;
  }
});

test("tenancy: client B's bootstrap shows none of A's achievements", async () => {
  const a = await newClient("tenA");
  const b = await newClient("tenB");
  await postLog(a.cookie, { sets: sets("squat", 5, 100) });
  assert.ok((await bootstrap(a.cookie)).achievements.length > 0);
  assert.deepEqual((await bootstrap(b.cookie)).achievements, []);
});
