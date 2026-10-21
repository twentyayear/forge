// server/test/coach.test.js -- W.3 coach lines. Runs ONLY against TEST_DATABASE_URL.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import pg from "pg";
import { makeTrainer, makeClient, signIn as signInWith, authHeaders } from "./helpers.js";

const { TEST_DATABASE_URL, DATABASE_URL } = process.env;
if (!TEST_DATABASE_URL) {
  console.error("FATAL: TEST_DATABASE_URL is not set. Refusing to run coach tests.");
  process.exit(1);
}
if (TEST_DATABASE_URL === DATABASE_URL) {
  console.error("FATAL: TEST_DATABASE_URL equals DATABASE_URL. Refusing to run coach tests.");
  process.exit(1);
}
if (process.env.NODE_ENV !== "test") {
  console.error("FATAL: NODE_ENV must be 'test' to run coach tests.");
  process.exit(1);
}

const { Pool } = pg;
const pool = new Pool({ connectionString: TEST_DATABASE_URL });
const { createApp } = await import("../app.js");
const { calls, testControls } = await import("../ai.js");
const { outcomeFor, bankLine, clampLine } = await import("../coach-bank.js");

const app = createApp(pool);
const server = http.createServer(app);
let baseUrl;
let trainer, A, B, cookieA, cookieB, asgA, asgB;

before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  trainer = await makeTrainer(pool, "coachTrainer");
  A = await makeClient(pool, trainer, "coachA");
  B = await makeClient(pool, trainer, "coachB");
  cookieA = await signInWith(pool, A);
  cookieB = await signInWith(pool, B);
  const blocks = [{ exercise_key: "Barbell Back Squat", sets: 4, reps: 5, weight_lbs: 185 }];
  const mk = async () => {
    const { rows } = await pool.query(
      `INSERT INTO workouts (created_by, title, blocks) VALUES ($1, 'Leg day', $2) RETURNING id`,
      [trainer.id, JSON.stringify(blocks)]
    );
    return rows[0].id;
  };
  const asg = async (u) => {
    const { rows } = await pool.query(
      `INSERT INTO workout_assignments (user_id, workout_id, scheduled_for, assigned_by)
       VALUES ($1, $2, CURRENT_DATE, $3) RETURNING id`,
      [u.id, await mk(), trainer.id]
    );
    return rows[0].id;
  };
  asgA = await asg(A);
  asgB = await asg(B);
  const prior = await asg(A);
  const { rows: log } = await pool.query(
    `INSERT INTO workout_logs (user_id, assignment_id, performed_at) VALUES ($1, $2, '2026-09-01T10:00:00Z') RETURNING id`,
    [A.id, prior]
  );
  for (let i = 1; i <= 3; i++) {
    await pool.query(
      `INSERT INTO workout_log_sets (user_id, log_id, exercise_key, set_no, reps, weight_lbs) VALUES ($1, $2, 'Barbell Back Squat', $3, 5, 175)`,
      [A.id, log[0].id, i]
    );
  }
  await pool.query(`INSERT INTO checkins (user_id, day, score, answers) VALUES ($1, CURRENT_DATE, 74, '{}')`, [A.id]);
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

const post = (path, cookie, body) =>
  fetch(baseUrl + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? authHeaders(cookie) : {}) },
    body: JSON.stringify(body),
  });
const rowCount = async (userId) =>
  (await pool.query(`SELECT count(*)::int AS n FROM coach_lines WHERE user_id = $1`, [userId])).rows[0].n;

const squatSets = [5, 5, 4, 5].map((reps, i) => ({
  set_no: i + 1, reps, weight_lbs: 185, target_reps: 5, target_weight_lbs: 185,
}));

let firstText;

test("happy path: ai line stored, context carries real numbers and no other client", async () => {
  const before = calls.length;
  const res = await post("/api/coach/line", cookieA, {
    assignment_id: asgA, exercise_key: "Barbell Back Squat", kind: "exercise", sets: squatSets,
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.source, "ai");
  assert.equal(body.cached, false);
  assert.ok(body.text.includes("185"));
  firstText = body.text;
  assert.equal(await rowCount(A.id), 1);
  assert.equal(calls.length, before + 1);
  const call = calls[calls.length - 1];
  assert.ok(call.system.includes("DATA"));
  assert.ok(call.system.includes("180 characters"));
  assert.ok(call.userContent.includes("Barbell Back Squat"));
  assert.ok(call.userContent.includes("175"));
  assert.ok(call.userContent.includes("74"));
  assert.ok(!call.userContent.includes(B.id));
});

test("repeat returns the cached line with no Claude call", async () => {
  const before = calls.length;
  const res = await post("/api/coach/line", cookieA, {
    assignment_id: asgA, exercise_key: "Barbell Back Squat", kind: "exercise", sets: squatSets,
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.cached, true);
  assert.equal(body.text, firstText);
  assert.equal(calls.length, before);
  assert.equal(await rowCount(A.id), 1);
});

test("finish uses the logged sets and stores exercise_key ''", async () => {
  const logRes = await post("/api/workout-logs", cookieA, {
    performed_at: new Date().toISOString(),
    assignment_id: asgA,
    sets: [{ exercise_key: "Barbell Back Squat", set_no: 1, reps: 7, weight_lbs: 195 }],
  });
  assert.equal(logRes.status, 201);
  const res = await post("/api/coach/line", cookieA, { assignment_id: asgA, kind: "finish", sets: [] });
  assert.equal(res.status, 200);
  const call = calls[calls.length - 1];
  assert.ok(call.userContent.includes("195"));
  assert.ok(call.userContent.includes("7"));
  const { rows } = await pool.query(
    `SELECT exercise_key, kind FROM coach_lines WHERE user_id = $1 AND kind = 'finish'`, [A.id]
  );
  assert.deepEqual(rows, [{ exercise_key: "", kind: "finish" }]);
});

test("Claude failure answers from the bank, never a 5xx", async () => {
  testControls.forceFailure = true;
  try {
    const res = await post("/api/coach/line", cookieA, {
      assignment_id: asgA, exercise_key: "Dumbbell Row", kind: "exercise",
      sets: [{ set_no: 1, reps: 8, weight_lbs: 50, target_reps: 8, target_weight_lbs: 50 }],
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.source, "bank");
    assert.ok(body.text.length <= 180);
    assert.ok(body.text.includes("Dumbbell Row"));
    const { rows } = await pool.query(
      `SELECT source FROM coach_lines WHERE user_id = $1 AND exercise_key = 'Dumbbell Row'`, [A.id]
    );
    assert.deepEqual(rows, [{ source: "bank" }]);
  } finally {
    testControls.forceFailure = false;
  }
});

test("ownership: another client's assignment, random uuid, and no session", async () => {
  const bBefore = await rowCount(B.id);
  const aBefore = await rowCount(A.id);
  const payload = (id) => ({ assignment_id: id, exercise_key: "Barbell Back Squat", kind: "exercise", sets: squatSets });
  assert.equal((await post("/api/coach/line", cookieA, payload(asgB))).status, 404);
  assert.equal(
    (await post("/api/coach/line", cookieA, payload("11111111-1111-4111-8111-111111111111"))).status, 404
  );
  assert.equal((await post("/api/coach/line", null, payload(asgA))).status, 401);
  assert.equal(await rowCount(B.id), bBefore);
  assert.equal(await rowCount(A.id), aBefore);
});

test("validation: bad bodies are 400 and write nothing", async () => {
  const aBefore = await rowCount(A.id);
  const good = { set_no: 1, reps: 5, weight_lbs: 100, target_reps: 5, target_weight_lbs: 100 };
  const base = { assignment_id: asgA, exercise_key: "Overhead Press", kind: "exercise", sets: [good] };
  const bad = [
    { ...base, kind: "x" },
    { ...base, sets: Array.from({ length: 21 }, (_, i) => ({ ...good, set_no: i + 1 })) },
    { ...base, sets: [{ ...good, reps: 201 }] },
    { ...base, sets: [{ ...good, weight_lbs: -1 }] },
    { assignment_id: asgA, kind: "exercise", sets: [good] },
  ];
  for (const b of bad) assert.equal((await post("/api/coach/line", cookieA, b)).status, 400, JSON.stringify(b).slice(0, 80));
  assert.equal(await rowCount(A.id), aBefore);
});

test("pure helpers", () => {
  const s = (reps, target) => ({ set_no: 1, reps, weight_lbs: 100, target_reps: target });
  assert.equal(outcomeFor([s(5, 5), s(5, 5)]), "hit");
  assert.equal(outcomeFor([s(5, 5), s(4, 5)]), "short");
  assert.equal(outcomeFor([s(6, 5), s(5, 5)]), "over");
  assert.equal(outcomeFor([{ set_no: 1, reps: 5, weight_lbs: 100, target_reps: null }]), "logged");
  const sets = [s(5, 5), s(5, 5)];
  for (const [kind, outcome] of [["exercise", "hit"], ["exercise", "short"], ["exercise", "over"], ["exercise", "logged"], ["finish", "hit"]]) {
    for (let r = 0; r < 3; r++) {
      const line = bankLine({ kind, outcome, exerciseName: "Barbell Back Squat", sets: [s(5 + r, 5)] });
      assert.ok(line.length <= 180);
      if (kind === "exercise") assert.ok(line.includes("Barbell Back Squat"));
    }
  }
  assert.ok(bankLine({ kind: "exercise", outcome: "hit", exerciseName: "X", sets: [] }).length > 0);
  const long = "This is a sentence. ".repeat(20);
  const out = clampLine(long);
  assert.ok(out.length <= 220 && out.endsWith("."));
  assert.equal(clampLine("   "), "Good work. Keep moving.");
  assert.ok(clampLine("a".repeat(400)).length <= 220);
});
