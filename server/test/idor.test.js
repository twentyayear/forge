// server/test/idor.test.js — milestone IDOR + auth sweep (U9, ask 35).
// Test-only unit: inventories every route the app serves, then runs auth and
// cross-user checks across the whole list. Same refuse-to-run guards and
// in-process boot pattern as admin.test.js. Runs ONLY against TEST_DATABASE_URL.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import pg from "pg";

const { TEST_DATABASE_URL, DATABASE_URL } = process.env;

if (!TEST_DATABASE_URL) {
  console.error("FATAL: TEST_DATABASE_URL is not set. Refusing to run idor tests.");
  process.exit(1);
}
if (TEST_DATABASE_URL === DATABASE_URL) {
  console.error(
    "FATAL: TEST_DATABASE_URL equals DATABASE_URL. Refusing to run idor tests against a non-test database."
  );
  process.exit(1);
}
if (process.env.NODE_ENV !== "test") {
  console.error("FATAL: NODE_ENV must be 'test' to run idor tests (mailer would call Resend otherwise).");
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
  return `${label}.${process.hrtime.bigint()}@idor-test.local`;
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

// ---- Route matrix + inventory ----

const MATRIX = [
  { method: "GET", path: "/api/health", access: "public" },
  { method: "POST", path: "/api/auth/request-link", access: "public" },
  { method: "GET", path: "/api/auth/verify", access: "public" },
  { method: "POST", path: "/api/auth/logout", access: "public" },
  { method: "POST", path: "/api/auth/login", access: "public" },

  { method: "GET", path: "/api/auth/me", access: "user" },
  { method: "GET", path: "/api/checkins", access: "user" },
  { method: "GET", path: "/api/bootstrap", access: "user" },
  { method: "POST", path: "/api/checkins", access: "user" },
  { method: "POST", path: "/api/fuel-logs", access: "user" },
  { method: "DELETE", path: "/api/fuel-logs/:id", access: "user" },
  { method: "POST", path: "/api/workout-logs", access: "user" },
  { method: "PATCH", path: "/api/profile", access: "user" },
  { method: "POST", path: "/api/import", access: "user" },
  { method: "POST", path: "/api/tts", access: "user" },
  { method: "GET", path: "/api/food", access: "user" },
  { method: "GET", path: "/api/messages", access: "user" },
  { method: "POST", path: "/api/messages", access: "user" },
  { method: "POST", path: "/api/messages/read", access: "user" },

  { method: "GET", path: "/api/admin/users", access: "admin" },
  { method: "GET", path: "/api/admin/users/:id/overview", access: "admin" },
  { method: "POST", path: "/api/admin/workouts", access: "admin" },
  { method: "GET", path: "/api/admin/workouts", access: "admin" },
  { method: "POST", path: "/api/admin/assignments", access: "admin" },
  { method: "PATCH", path: "/api/admin/assignments/:id", access: "admin" },
  { method: "GET", path: "/api/admin/drafts", access: "admin" },
  { method: "PATCH", path: "/api/admin/drafts/:id", access: "admin" },
  { method: "POST", path: "/api/admin/drafts/:id/approve", access: "admin" },
  { method: "POST", path: "/api/admin/drafts/:id/reject", access: "admin" },
  { method: "PATCH", path: "/api/admin/users/:id/settings", access: "admin" },
  { method: "POST", path: "/api/admin/jobs/:name/run", access: "admin" },
  { method: "GET", path: "/api/admin/inbox", access: "admin" },
  { method: "GET", path: "/api/admin/users/:id/messages", access: "admin" },
  { method: "POST", path: "/api/admin/users/:id/messages", access: "admin" },
];

// Walks the express 4 router stack: direct routes, then mounted routers
// (one level deep, which is how createApp mounts everything).
function walkRoutes(expressApp) {
  const out = [];
  const methodsOf = (route) => Object.keys(route.methods).map((m) => m.toUpperCase());
  for (const l of expressApp._router.stack) {
    if (l.route) {
      for (const m of methodsOf(l.route)) out.push(`${m} ${l.route.path}`);
    } else if (l.name === "router") {
      const prefix = l.regexp.source
        .replace("^", "")
        .replace("\\/?(?=\\/|$)", "")
        .replace(/\\\//g, "/");
      for (const sl of l.handle.stack) {
        if (!sl.route) continue;
        for (const m of methodsOf(sl.route)) out.push(`${m} ${prefix}${sl.route.path}`);
      }
    }
  }
  return out;
}

function diffInventory(actual, expected) {
  const a = new Set(actual);
  const e = new Set(expected);
  return {
    unlisted: [...a].filter((x) => !e.has(x)).sort(),
    missing: [...e].filter((x) => !a.has(x)).sort(),
  };
}

const MATRIX_KEYS = MATRIX.map((r) => `${r.method} ${r.path}`);

function concretePath(path) {
  return path.replace(":id", crypto.randomUUID()).replace(":name", "daily-monitor");
}

async function call(method, path, { cookie, body } = {}) {
  const headers = cookie ? authHeaders(cookie) : {};
  const init = { method, headers: { ...headers } };
  if (method === "POST" || method === "PATCH" || method === "DELETE") {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(body ?? {});
  }
  const res = await fetch(`${baseUrl}${concretePath(path)}`, init);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON body (e.g. empty 404)
  }
  return { status: res.status, text, json };
}

const q = async (sql, params) => (await pool.query(sql, params)).rows;
const count = async (sql, params) => (await q(sql, params))[0].n;

// ---- Tests ----

test("inventory matches the matrix exactly", () => {
  const actual = walkRoutes(createApp(pool));
  const { unlisted, missing } = diffInventory(actual, MATRIX_KEYS);
  assert.deepEqual(
    { unlisted, missing },
    { unlisted: [], missing: [] },
    `routes served but not in matrix: ${JSON.stringify(unlisted)}; matrix entries not served: ${JSON.stringify(missing)}`
  );
  assert.equal(actual.length, 34);
  assert.equal(MATRIX.length, 34);
});

test("inventory catches drift", () => {
  const drifted = createApp(pool);
  drifted.get("/api/zz-unlisted", (_req, res) => res.json({}));
  const { unlisted, missing } = diffInventory(walkRoutes(drifted), MATRIX_KEYS);
  assert.deepEqual(unlisted, ["GET /api/zz-unlisted"]);
  assert.deepEqual(missing, []);
});

test("unauthenticated sweep", async () => {
  for (const r of MATRIX) {
    const key = `${r.method} ${r.path}`;
    const { status } = await call(r.method, r.path);
    if (r.access === "user" || r.access === "admin") {
      assert.equal(status, 401, `${key} without a cookie`);
    } else if (key === "GET /api/health" || key === "POST /api/auth/logout") {
      assert.equal(status, 200, key);
    } else {
      assert.notEqual(status, 401, key);
      assert.ok(status < 500, `${key} returned ${status}`);
    }
  }
});

test("non-admin sweep", async () => {
  const u = await makeUser("user", "plainuser");
  const cookie = await signIn(u);

  const snapshot = async () => ({
    workouts: await count(`SELECT COUNT(*)::int AS n FROM workouts WHERE created_by = $1`, [u.id]),
    assignments: await count(
      `SELECT COUNT(*)::int AS n FROM workout_assignments WHERE assigned_by = $1 OR user_id = $1`,
      [u.id]
    ),
    drafts: await count(`SELECT COUNT(*)::int AS n FROM ai_drafts WHERE user_id = $1`, [u.id]),
    messages: await count(`SELECT COUNT(*)::int AS n FROM messages WHERE user_id = $1`, [u.id]),
    jobRuns: await count(`SELECT COUNT(*)::int AS n FROM job_runs WHERE user_id = $1`, [u.id]),
  });

  const before = await snapshot();
  for (const r of MATRIX.filter((x) => x.access === "admin")) {
    const res = await call(r.method, r.path, { cookie });
    assert.equal(res.status, 404, `${r.method} ${r.path} as non-admin`);
    assert.equal(res.text, "", `${r.method} ${r.path} as non-admin must have an empty body`);
  }
  assert.deepEqual(await snapshot(), before);
});

async function seedUser(label, admin) {
  const user = await makeUser("user", label);
  const ids = { user: user.id };
  ids.checkin = (
    await q(
      `INSERT INTO checkins (user_id, day, score, answers) VALUES ($1, '2026-01-10', 70, '{"mood":"ok"}') RETURNING id`,
      [user.id]
    )
  )[0].id;
  ids.fuel = (
    await q(
      `INSERT INTO fuel_logs (user_id, eaten_on, name, calories, protein_g, carbs_g, fat_g)
       VALUES ($1, '2026-01-10', $2, 500, 30, 50, 10) RETURNING id`,
      [user.id, `meal-${label}`]
    )
  )[0].id;
  ids.workout = (
    await q(`INSERT INTO workouts (created_by, title) VALUES ($1, $2) RETURNING id`, [admin.id, `wk-${label}`])
  )[0].id;
  ids.assignment = (
    await q(
      `INSERT INTO workout_assignments (user_id, workout_id, scheduled_for, assigned_by)
       VALUES ($1, $2, CURRENT_DATE, $3) RETURNING id`,
      [user.id, ids.workout, admin.id]
    )
  )[0].id;
  ids.log = (
    await q(`INSERT INTO workout_logs (user_id, assignment_id, performed_at) VALUES ($1, $2, now()) RETURNING id`, [
      user.id,
      ids.assignment,
    ])
  )[0].id;
  await q(
    `INSERT INTO workout_log_sets (user_id, log_id, exercise_key, set_no, reps, weight_lbs)
     VALUES ($1, $2, 'bench_press', 1, 8, 135)`,
    [user.id, ids.log]
  );
  ids.message = (
    await q(`INSERT INTO messages (user_id, sender, body) VALUES ($1, 'kyle', $2) RETURNING id`, [
      user.id,
      `hello-${label}`,
    ])
  )[0].id;
  return { user, ids };
}

async function setupAB() {
  const admin = await makeUser("admin", "idoradmin");
  const A = await seedUser("userA", admin);
  const B = await seedUser("userB", admin);
  const cookieA = await signIn(A.user);
  return { A, B, cookieA };
}

test("cross-user reads", async () => {
  const { A, B, cookieA } = await setupAB();
  const bValues = Object.values(B.ids);

  const routes = [
    { path: "/api/bootstrap", own: [A.ids.fuel, A.ids.assignment, A.ids.log] },
    { path: "/api/checkins", own: [A.ids.checkin] },
    { path: "/api/messages", own: [A.ids.message] },
    { path: "/api/auth/me", own: [A.user.id] },
  ];
  for (const { path, own } of routes) {
    const res = await call("GET", path, { cookie: cookieA });
    assert.equal(res.status, 200, path);
    const body = JSON.stringify(res.json);
    for (const id of bValues) assert.ok(!body.includes(id), `${path} leaked B id ${id}`);
    assert.ok(!body.includes(B.user.email), `${path} leaked B email`);
    for (const id of own) assert.ok(body.includes(id), `${path} missing A's own id ${id}`);
  }
});

test("cross-user writes", async () => {
  const { A, B, cookieA } = await setupAB();

  const bFuelCount = () => count(`SELECT COUNT(*)::int AS n FROM fuel_logs WHERE user_id = $1`, [B.user.id]);
  const bCheckinCount = () => count(`SELECT COUNT(*)::int AS n FROM checkins WHERE user_id = $1`, [B.user.id]);
  const logCount = (u) => count(`SELECT COUNT(*)::int AS n FROM workout_logs WHERE user_id = $1`, [u.id]);
  const bCheckinRows = async () =>
    JSON.stringify(await q(`SELECT * FROM checkins WHERE user_id = $1 ORDER BY id`, [B.user.id]));
  const bProfile = async () => JSON.stringify((await q(`SELECT profile FROM users WHERE id = $1`, [B.user.id]))[0]);
  const bMessageCount = () => count(`SELECT COUNT(*)::int AS n FROM messages WHERE user_id = $1`, [B.user.id]);

  // DELETE B's fuel row
  let res = await call("DELETE", `/api/fuel-logs/${B.ids.fuel}`, { cookie: cookieA });
  assert.equal(res.status, 404);
  assert.equal(await count(`SELECT COUNT(*)::int AS n FROM fuel_logs WHERE id = $1`, [B.ids.fuel]), 1);

  // workout log against B's assignment
  const aLogs = await logCount(A.user);
  const bLogs = await logCount(B.user);
  const bStatus = (await q(`SELECT status FROM workout_assignments WHERE id = $1`, [B.ids.assignment]))[0].status;
  res = await call("POST", "/api/workout-logs", {
    cookie: cookieA,
    body: {
      performed_at: new Date().toISOString(),
      assignment_id: B.ids.assignment,
      sets: [{ exercise_key: "bench_press", set_no: 1, reps: 5, weight_lbs: 100 }],
    },
  });
  assert.equal(res.status, 400);
  assert.equal(
    (await q(`SELECT status FROM workout_assignments WHERE id = $1`, [B.ids.assignment]))[0].status,
    bStatus
  );
  assert.equal(await logCount(A.user), aLogs);
  assert.equal(await logCount(B.user), bLogs);

  // mark-read only touches A's messages
  res = await call("POST", "/api/messages/read", { cookie: cookieA });
  assert.equal(res.status, 200);
  assert.equal((await q(`SELECT read_at FROM messages WHERE id = $1`, [B.ids.message]))[0].read_at, null);

  // checkin with a smuggled user_id
  const beforeCheckins = await bCheckinRows();
  res = await call("POST", "/api/checkins", {
    cookie: cookieA,
    body: { user_id: B.user.id, day: "2026-01-11", score: 55, answers: { mood: "x" } },
  });
  assert.equal(await bCheckinRows(), beforeCheckins);
  if (res.status === 200) {
    assert.equal(
      await count(`SELECT COUNT(*)::int AS n FROM checkins WHERE user_id = $1 AND day = '2026-01-11'`, [A.user.id]),
      1
    );
  }

  // profile patch with a smuggled user_id
  const beforeProfile = await bProfile();
  res = await call("PATCH", "/api/profile", {
    cookie: cookieA,
    body: { user_id: B.user.id, bodyweight: 180 },
  });
  assert.equal(await bProfile(), beforeProfile);

  // import with a smuggled user_id (A already has data -> 409)
  const bCheckinsBefore = await bCheckinCount();
  const bFuelBefore = await bFuelCount();
  res = await call("POST", "/api/import", {
    cookie: cookieA,
    body: {
      user_id: B.user.id,
      checkins: { "2026-02-01": { score: 50, answers: {} } },
      fuelLog: [{ eaten_on: "2026-02-01", name: "x", calories: 100 }],
    },
  });
  assert.equal(res.status, 409);
  assert.equal(await bCheckinCount(), bCheckinsBefore);
  assert.equal(await bFuelCount(), bFuelBefore);

  // message with a smuggled user_id
  const bMsgsBefore = await bMessageCount();
  res = await call("POST", "/api/messages", {
    cookie: cookieA,
    body: { user_id: B.user.id, body: "hi from A" },
  });
  assert.equal(res.status, 201);
  assert.equal(await bMessageCount(), bMsgsBefore);
});
