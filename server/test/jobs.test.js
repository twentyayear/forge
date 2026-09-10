// server/test/jobs.test.js — U8 automation job tests (ask 34). Same
// refuse-to-run guards as the other suites. Runs ONLY against
// TEST_DATABASE_URL.
//
// Tests 1-7 call runDailyMonitor/runWeeklySummary/isoWeekKey DIRECTLY with a
// FAKE generateFromContext (no pg-boss, no Claude API) so they're fast and
// don't depend on ai.js's Claude-shaped context assumptions. Test 8 drives
// the real admin route (POST /api/admin/jobs/:name/run), which does go
// through the real ai.js generateFromContext -- but NODE_ENV=test means
// ai.js's callClaude is already faked internally (see ai.js/ai.test.js), so
// no real network call happens there either.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import pg from "pg";

const { TEST_DATABASE_URL, DATABASE_URL } = process.env;

if (!TEST_DATABASE_URL) {
  console.error("FATAL: TEST_DATABASE_URL is not set. Refusing to run jobs tests.");
  process.exit(1);
}
if (TEST_DATABASE_URL === DATABASE_URL) {
  console.error(
    "FATAL: TEST_DATABASE_URL equals DATABASE_URL. Refusing to run jobs tests against a non-test database."
  );
  process.exit(1);
}
if (process.env.NODE_ENV !== "test") {
  console.error("FATAL: NODE_ENV must be 'test' to run jobs tests (ai.js would call the real Claude API otherwise).");
  process.exit(1);
}

const { Pool } = pg;
const pool = new Pool({ connectionString: TEST_DATABASE_URL });

const { createApp } = await import("../app.js");
const { runDailyMonitor, runWeeklySummary, isoWeekInfo, isoWeekKey } = await import("../jobs.js");

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

// A fixed reference "today", well clear of every other suite's seeded dates
// (which cluster around 2026-09-xx) so cross-suite users never contaminate
// these tests' findings -- not that they could anyway, since every query in
// jobs.js is user_id-scoped; this just keeps things easy to reason about.
const NOW = new Date("2026-02-10T12:00:00.000Z");

function uniqueEmail(label) {
  return `${label}.${process.hrtime.bigint()}@jobs-test.local`;
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

async function makeWorkout(creatorId, title) {
  const { rows } = await pool.query(`INSERT INTO workouts (created_by, title) VALUES ($1, $2) RETURNING id`, [
    creatorId,
    title,
  ]);
  return rows[0].id;
}

async function assignWorkout(userId, workoutId, scheduledFor, status = "assigned") {
  const { rows } = await pool.query(
    `INSERT INTO workout_assignments (user_id, workout_id, scheduled_for, status, assigned_by)
     VALUES ($1, $2, $3, $4, $1) RETURNING id`,
    [userId, workoutId, scheduledFor, status]
  );
  return rows[0].id;
}

async function seedCheckin(userId, day, score) {
  await pool.query(`INSERT INTO checkins (user_id, day, score, answers) VALUES ($1, $2, $3, '{}')`, [
    userId,
    day,
    score,
  ]);
}

async function seedWorkoutLog(userId, performedAt, sets) {
  const { rows } = await pool.query(
    `INSERT INTO workout_logs (user_id, performed_at) VALUES ($1, $2) RETURNING id`,
    [userId, performedAt]
  );
  const logId = rows[0].id;
  let setNo = 1;
  for (const s of sets) {
    await pool.query(
      `INSERT INTO workout_log_sets (user_id, log_id, exercise_key, set_no, reps, weight_lbs) VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, logId, s.exercise_key ?? "bench_press", setNo++, s.reps, s.weight_lbs ?? null]
    );
  }
  return logId;
}

async function seedFuelLog(userId, eatenOn) {
  await pool.query(`INSERT INTO fuel_logs (user_id, eaten_on, name) VALUES ($1, $2, 'Test meal')`, [userId, eatenOn]);
}

async function draftsFor(userId) {
  const { rows } = await pool.query(`SELECT * FROM ai_drafts WHERE user_id = $1 ORDER BY created_at ASC`, [userId]);
  return rows;
}

async function jobRun(jobName, dedupeKey) {
  const { rows } = await pool.query(`SELECT * FROM job_runs WHERE job_name = $1 AND dedupe_key = $2`, [
    jobName,
    dedupeKey,
  ]);
  return rows[0] || null;
}

// ---- fake generateFromContext (no pg-boss, no Claude API) ----

function fakeBody(kind, context) {
  if (kind === "monitor") {
    const missed = context.findings.find((f) => f.type === "missed_workout");
    if (missed) {
      const a = missed.assignments[0];
      return `Kyle here -- noticed you missed "${a.title}" on ${a.scheduled_for}. Let's get back on track.`;
    }
    const slump = context.findings.find((f) => f.type === "readiness_slump");
    return `Kyle here -- readiness mean dropped to ${slump.mean3}. Let's dial back intensity this week.`;
  }
  return `Kyle's weekly recap: ${context.assignmentsCompleted}/${context.assignmentsAssigned} workouts, ${context.checkinCount} checkins (avg ${context.meanScore}), ${context.totalVolume} lbs total volume, ${context.fuelDays} fuel days.`;
}

function makeFakeDeps({ failingUserIds = new Set() } = {}) {
  const calls = [];
  async function generateFromContext(p, { userId, kind, context, triggerId }) {
    calls.push({ userId, kind, context, triggerId });
    if (failingUserIds.has(userId)) throw new Error("simulated generation failure");

    const body = fakeBody(kind, context);
    const userResult = await p.query(`SELECT profile FROM users WHERE id = $1`, [userId]);
    const profile = userResult.rows[0]?.profile ?? {};
    const client = await p.connect();
    try {
      await client.query("BEGIN");
      if (profile.kyleAutoSend === true) {
        const { rows: msgRows } = await client.query(
          `INSERT INTO messages (user_id, sender, body, ai_generated) VALUES ($1, 'kyle', $2, true) RETURNING id`,
          [userId, body]
        );
        await client.query(
          `INSERT INTO ai_drafts (user_id, trigger_type, trigger_id, body, status, sent_message_id, decided_at)
           VALUES ($1, 'manual', $2, $3, 'sent', $4, now())`,
          [userId, triggerId, body, msgRows[0].id]
        );
      } else {
        await client.query(
          `INSERT INTO ai_drafts (user_id, trigger_type, trigger_id, body) VALUES ($1, 'manual', $2, $3)`,
          [userId, triggerId, body]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
  return { deps: { generateFromContext }, calls };
}

// ---- 1. ISO week helper ----

test("isoWeekKey is correct across a year boundary", () => {
  // 2016-01-01 is a Friday -> belongs to ISO week 2015-W53.
  assert.equal(isoWeekKey(new Date(Date.UTC(2016, 0, 1))), "2015-W53");
  // 2024-12-30 is a Monday -> belongs to ISO week 2025-W01.
  assert.equal(isoWeekKey(new Date(Date.UTC(2024, 11, 30))), "2025-W01");
  // A plain midweek date within a normal year.
  const { isoYear, isoWeek } = isoWeekInfo(new Date(Date.UTC(2026, 5, 17))); // 2026-06-17, a Wednesday
  assert.equal(isoYear, 2026);
  assert.equal(isoWeek, 25);
});

// ---- 2. Daily monitor: seeded missed assignment -> one draft; double-run idempotent ----

test("daily monitor: missed assignment produces one pending draft quoting it; a second run is a no-op", async () => {
  const user = await makeUser("user", "missedWorkout");
  const workoutId = await makeWorkout(user.id, "Leg Day");
  const yesterday = "2026-02-09"; // NOW - 1 day, within the 7-day lookback
  await assignWorkout(user.id, workoutId, yesterday, "assigned");

  const { deps } = makeFakeDeps();
  const first = await runDailyMonitor(pool, deps, { now: NOW });
  assert.equal(first.errors, 0);

  const drafts = await draftsFor(user.id);
  assert.equal(drafts.length, 1, "exactly one draft after the seeded miss");
  assert.equal(drafts[0].status, "pending");
  assert.equal(drafts[0].trigger_type, "manual");
  assert.ok(drafts[0].body.includes("Leg Day"), `draft should quote the missed workout: ${drafts[0].body}`);

  const run = await jobRun("daily-monitor", `${user.id}:2026-02-10`);
  assert.ok(run, "job_runs marker written for this user/day");
  assert.deepEqual(run.result.findings, ["missed_workout"]);

  // Second run, same day -> no new claim, no new draft.
  const second = await runDailyMonitor(pool, deps, { now: NOW });
  const draftsAfter = await draftsFor(user.id);
  assert.equal(draftsAfter.length, 1, "double-run adds zero new drafts");
  assert.ok(second.skipped >= 1, "the already-claimed user counts as skipped on the second run");
});

// ---- 3. Readiness slump detected; steady scores -> no finding, no message (also covers #4) ----

test("daily monitor: readiness slump is detected; a steady-scoring athlete gets no finding and no message (job_runs still written)", async () => {
  const slumpUser = await makeUser("user", "slumpAthlete");
  // Prior 7 days: healthy ~80s. Last 3: dropped hard to ~40s (>=15 below prior, and below the 50 floor).
  const priorDays = ["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02", "2026-02-03", "2026-02-04", "2026-02-05"];
  for (const d of priorDays) await seedCheckin(slumpUser.id, d, 80);
  await seedCheckin(slumpUser.id, "2026-02-07", 42);
  await seedCheckin(slumpUser.id, "2026-02-08", 38);
  await seedCheckin(slumpUser.id, "2026-02-09", 40);

  const steadyUser = await makeUser("user", "steadyAthlete");
  const steadyDays = ["2026-02-04", "2026-02-05", "2026-02-06", "2026-02-07", "2026-02-08", "2026-02-09"];
  for (const d of steadyDays) await seedCheckin(steadyUser.id, d, 72);

  const { deps } = makeFakeDeps();
  const summary = await runDailyMonitor(pool, deps, { now: NOW });
  assert.equal(summary.errors, 0);

  const slumpDrafts = await draftsFor(slumpUser.id);
  assert.equal(slumpDrafts.length, 1, "slump athlete gets one draft");
  assert.ok(slumpDrafts[0].body.includes("readiness"), `draft should reference the slump: ${slumpDrafts[0].body}`);

  const steadyDrafts = await draftsFor(steadyUser.id);
  assert.equal(steadyDrafts.length, 0, "steady athlete gets no draft");

  const steadyRun = await jobRun("daily-monitor", `${steadyUser.id}:2026-02-10`);
  assert.ok(steadyRun, "job_runs row still written for the no-findings athlete");
  assert.deepEqual(steadyRun.result.findings, []);
});

// ---- 5. Weekly summary: active athlete gets a recap; zero-activity athlete is skipped (also covers #6 double-run) ----

test("weekly summary: active athlete gets a recap draft citing real counts; zero-activity athlete is skipped; a second run in the same ISO week is a no-op", async () => {
  const activeUser = await makeUser("user", "weeklyActive");
  await seedCheckin(activeUser.id, "2026-02-05", 70);
  await seedCheckin(activeUser.id, "2026-02-07", 80);
  await seedWorkoutLog(activeUser.id, "2026-02-06T12:00:00Z", [
    { reps: 5, weight_lbs: 135 },
    { reps: 5, weight_lbs: 135 },
  ]);
  await seedFuelLog(activeUser.id, "2026-02-06");

  const idleUser = await makeUser("user", "weeklyIdle");

  const { deps } = makeFakeDeps();
  const first = await runWeeklySummary(pool, deps, { now: NOW });
  assert.equal(first.errors, 0);

  const activeDrafts = await draftsFor(activeUser.id);
  assert.equal(activeDrafts.length, 1, "active athlete gets one recap draft");
  assert.ok(activeDrafts[0].body.includes("2 checkins"), `recap should cite the real checkin count: ${activeDrafts[0].body}`);
  assert.ok(activeDrafts[0].body.includes("1350"), `recap should cite the real volume (5*135 + 5*135): ${activeDrafts[0].body}`);

  const idleDrafts = await draftsFor(idleUser.id);
  assert.equal(idleDrafts.length, 0, "zero-activity athlete gets no draft");

  const weekKey = isoWeekKey(NOW);
  const idleRun = await jobRun("weekly-summary", `${idleUser.id}:${weekKey}`);
  assert.ok(idleRun, "job_runs row written for the skipped athlete");
  assert.deepEqual(idleRun.result, { skipped: "no activity" });

  // Double-run, same ISO week -> zero new rows for either athlete.
  const second = await runWeeklySummary(pool, deps, { now: NOW });
  const activeDraftsAfter = await draftsFor(activeUser.id);
  assert.equal(activeDraftsAfter.length, 1, "double-run adds zero new drafts");
  assert.ok(second.skipped >= 2, "both athletes are already-claimed on the second run");
});

// ---- 7. One athlete's generator throwing doesn't abort the others ----

test("daily monitor: one athlete's generateFromContext throwing still lets the others get processed, and counts as an error", async () => {
  const poisonUser = await makeUser("user", "poisonAthlete");
  const goodUser = await makeUser("user", "goodAthlete");
  const workoutId = await makeWorkout(goodUser.id, "Poison-test workout");
  await assignWorkout(poisonUser.id, workoutId, "2026-02-09", "assigned");
  await assignWorkout(goodUser.id, workoutId, "2026-02-09", "assigned");

  const { deps } = makeFakeDeps({ failingUserIds: new Set([poisonUser.id]) });
  const summary = await runDailyMonitor(pool, deps, { now: NOW });

  assert.ok(summary.errors >= 1, "the poisoned athlete counts as an error");

  const poisonDrafts = await draftsFor(poisonUser.id);
  assert.equal(poisonDrafts.length, 0, "poisoned athlete gets no draft (the throw happened before any insert)");

  const goodDrafts = await draftsFor(goodUser.id);
  assert.equal(goodDrafts.length, 1, "the OTHER athlete is still processed normally");

  // The poisoned athlete's day is still claimed (claim happens before the
  // throw), so a same-day re-run does not retry them.
  const poisonRun = await jobRun("daily-monitor", `${poisonUser.id}:2026-02-10`);
  assert.ok(poisonRun, "job_runs marker was still written before the failure");
});

// ---- 8. Admin route wiring ----

test("admin jobs route: 401 no session, 404 non-admin, 404 unknown job name, 200 + summary as admin", async () => {
  const normal = await makeUser("user", "jobsRouteNormal");
  const normalCookie = await signIn(normal);
  const admin = await makeUser("admin", "jobsRouteAdmin");
  const adminCookie = await signIn(admin);

  const noAuth = await fetch(`${baseUrl}/api/admin/jobs/daily-monitor/run`, { method: "POST" });
  assert.equal(noAuth.status, 401);

  const nonAdmin = await fetch(`${baseUrl}/api/admin/jobs/daily-monitor/run`, {
    method: "POST",
    headers: authHeaders(normalCookie),
  });
  assert.equal(nonAdmin.status, 404);

  const unknownName = await fetch(`${baseUrl}/api/admin/jobs/not-a-real-job/run`, {
    method: "POST",
    headers: authHeaders(adminCookie),
  });
  assert.equal(unknownName.status, 404);

  const dailyOk = await fetch(`${baseUrl}/api/admin/jobs/daily-monitor/run`, {
    method: "POST",
    headers: authHeaders(adminCookie),
  });
  assert.equal(dailyOk.status, 200);
  const dailySummary = await dailyOk.json();
  for (const key of ["users", "acted", "skipped", "errors"]) {
    assert.equal(typeof dailySummary[key], "number", `${key} should be a number: ${JSON.stringify(dailySummary)}`);
  }

  const weeklyOk = await fetch(`${baseUrl}/api/admin/jobs/weekly-summary/run`, {
    method: "POST",
    headers: authHeaders(adminCookie),
  });
  assert.equal(weeklyOk.status, 200);
  const weeklySummary = await weeklyOk.json();
  for (const key of ["users", "acted", "skipped", "errors"]) {
    assert.equal(typeof weeklySummary[key], "number", `${key} should be a number: ${JSON.stringify(weeklySummary)}`);
  }
});
