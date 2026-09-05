// server/test/messages.test.js — messaging route integration tests (U6, ask
// 32). Same refuse-to-run guards and in-process boot pattern as
// admin.test.js / data.test.js. Runs ONLY against TEST_DATABASE_URL.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import pg from "pg";

const { TEST_DATABASE_URL, DATABASE_URL } = process.env;

if (!TEST_DATABASE_URL) {
  console.error("FATAL: TEST_DATABASE_URL is not set. Refusing to run messages tests.");
  process.exit(1);
}
if (TEST_DATABASE_URL === DATABASE_URL) {
  console.error(
    "FATAL: TEST_DATABASE_URL equals DATABASE_URL. Refusing to run messages tests against a non-test database."
  );
  process.exit(1);
}
if (process.env.NODE_ENV !== "test") {
  console.error("FATAL: NODE_ENV must be 'test' to run messages tests (mailer would call Resend otherwise).");
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
  return `${label}.${process.hrtime.bigint()}@messages-test.local`;
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

async function insertMessage(user, sender, body, readAt = null) {
  const { rows } = await pool.query(
    `INSERT INTO messages (user_id, sender, body, read_at) VALUES ($1, $2, $3, $4) RETURNING id`,
    [user.id, sender, body, readAt]
  );
  return rows[0].id;
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

test("route sweep: 401 with no session; admin routes 404 for a non-admin session", async () => {
  const normal = await makeUser("user", "sweepNormal");
  const normalCookie = await signIn(normal);

  const calls = [
    { method: "GET", path: "/api/messages", admin: false },
    { method: "POST", path: "/api/messages", body: { body: "hi" }, admin: false },
    { method: "POST", path: "/api/messages/read", admin: false },
    { method: "GET", path: "/api/admin/inbox", admin: true },
    { method: "GET", path: `/api/admin/users/${normal.id}/messages`, admin: true },
    { method: "POST", path: `/api/admin/users/${normal.id}/messages`, body: { body: "hi" }, admin: true },
  ];

  for (const call of calls) {
    const noAuthRes = await fetch(`${baseUrl}${call.path}`, {
      method: call.method,
      headers: { "content-type": "application/json" },
      body: call.body ? JSON.stringify(call.body) : undefined,
    });
    assert.equal(noAuthRes.status, 401, `${call.method} ${call.path} with no session`);

    if (call.admin) {
      const nonAdminRes = await fetch(`${baseUrl}${call.path}`, {
        method: call.method,
        headers: { ...authHeaders(normalCookie), "content-type": "application/json" },
        body: call.body ? JSON.stringify(call.body) : undefined,
      });
      assert.equal(nonAdminRes.status, 404, `${call.method} ${call.path} for a non-admin session`);
    }
  }
});

test("athlete POST + GET round-trip; body validation rejects empty and >2000 chars", async () => {
  const user = await makeUser("user", "roundtrip");
  const cookie = await signIn(user);

  const post = await fetch(`${baseUrl}/api/messages`, {
    method: "POST",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify({ body: "How did today's session feel?" }),
  });
  assert.equal(post.status, 201);
  const created = await post.json();
  assert.equal(created.sender, "user");
  assert.equal(created.body, "How did today's session feel?");
  assert.equal(created.ai_generated, false);

  const get = await fetch(`${baseUrl}/api/messages`, { headers: authHeaders(cookie) });
  assert.equal(get.status, 200);
  const rows = await get.json();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, created.id);

  const empty = await fetch(`${baseUrl}/api/messages`, {
    method: "POST",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify({ body: "   " }),
  });
  assert.equal(empty.status, 400);

  const tooLong = await fetch(`${baseUrl}/api/messages`, {
    method: "POST",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify({ body: "x".repeat(2001) }),
  });
  assert.equal(tooLong.status, 400);

  const exactLimit = await fetch(`${baseUrl}/api/messages`, {
    method: "POST",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify({ body: "x".repeat(2000) }),
  });
  assert.equal(exactLimit.status, 201);
});

test("athlete A cannot see athlete B's thread", async () => {
  const userA = await makeUser("user", "scopeA");
  const userB = await makeUser("user", "scopeB");
  await insertMessage(userA, "kyle", "Message for A");
  await insertMessage(userB, "kyle", "Message for B");

  const cookieA = await signIn(userA);
  const res = await fetch(`${baseUrl}/api/messages`, { headers: authHeaders(cookieA) });
  assert.equal(res.status, 200);
  const rows = await res.json();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].body, "Message for A");
});

test("read semantics: athlete POST /read marks exactly kyle-sent unread; admin GET thread marks exactly user-sent unread", async () => {
  const admin = await makeUser("admin", "readAdmin");
  const athlete = await makeUser("user", "readAthlete");

  await insertMessage(athlete, "kyle", "Kyle msg 1");
  await insertMessage(athlete, "kyle", "Kyle msg 2");
  await insertMessage(athlete, "user", "User msg 1");
  const alreadyRead = await insertMessage(athlete, "kyle", "Already read", new Date());

  const athleteCookie = await signIn(athlete);
  const readRes = await fetch(`${baseUrl}/api/messages/read`, {
    method: "POST",
    headers: authHeaders(athleteCookie),
  });
  assert.equal(readRes.status, 200);
  const readBody = await readRes.json();
  assert.equal(readBody.marked, 2, "only the two unread kyle-sent rows are marked");

  const { rows: kyleRows } = await pool.query(
    `SELECT read_at FROM messages WHERE user_id = $1 AND sender = 'kyle' ORDER BY created_at ASC`,
    [athlete.id]
  );
  assert.ok(kyleRows.every((r) => r.read_at !== null), "all kyle-sent rows now read");
  const { rows: userRows } = await pool.query(
    `SELECT read_at FROM messages WHERE user_id = $1 AND sender = 'user'`,
    [athlete.id]
  );
  assert.equal(userRows[0].read_at, null, "user-sent row untouched by athlete's own read call");

  // Second call marks nothing further.
  const readAgain = await fetch(`${baseUrl}/api/messages/read`, {
    method: "POST",
    headers: authHeaders(athleteCookie),
  });
  const readAgainBody = await readAgain.json();
  assert.equal(readAgainBody.marked, 0);

  const adminCookie = await signIn(admin);
  const threadRes = await fetch(`${baseUrl}/api/admin/users/${athlete.id}/messages`, {
    headers: authHeaders(adminCookie),
  });
  assert.equal(threadRes.status, 200);
  const threadBody = await threadRes.json();
  assert.equal(threadBody.marked, 1, "the one unread user-sent row is marked");
  assert.equal(threadBody.messages.length, 4);
  assert.ok(threadBody.messages.every((m, i, arr) => i === 0 || m.created_at >= arr[i - 1].created_at), "asc order");

  const { rows: userRowsAfter } = await pool.query(
    `SELECT read_at FROM messages WHERE user_id = $1 AND sender = 'user'`,
    [athlete.id]
  );
  assert.ok(userRowsAfter[0].read_at !== null, "user-sent row now read after admin viewed the thread");
});

test("admin thread GET/POST 404 on unknown user id", async () => {
  const admin = await makeUser("admin", "unknownAdmin");
  const cookie = await signIn(admin);
  const unknownId = "00000000-0000-0000-0000-000000000000";

  const getRes = await fetch(`${baseUrl}/api/admin/users/${unknownId}/messages`, {
    headers: authHeaders(cookie),
  });
  assert.equal(getRes.status, 404);

  const postRes = await fetch(`${baseUrl}/api/admin/users/${unknownId}/messages`, {
    method: "POST",
    headers: { ...authHeaders(cookie), "content-type": "application/json" },
    body: JSON.stringify({ body: "hi" }),
  });
  assert.equal(postRes.status, 404);
});

test("admin POST reply: happy path shows up in the athlete's own GET", async () => {
  const admin = await makeUser("admin", "replyAdmin");
  const athlete = await makeUser("user", "replyAthlete");
  const adminCookie = await signIn(admin);

  const post = await fetch(`${baseUrl}/api/admin/users/${athlete.id}/messages`, {
    method: "POST",
    headers: { ...authHeaders(adminCookie), "content-type": "application/json" },
    body: JSON.stringify({ body: "Felt strong today." }),
  });
  assert.equal(post.status, 201);
  const created = await post.json();
  assert.equal(created.sender, "kyle");

  const athleteCookie = await signIn(athlete);
  const get = await fetch(`${baseUrl}/api/messages`, { headers: authHeaders(athleteCookie) });
  const rows = await get.json();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].body, "Felt strong today.");
});

test("inbox: last_message + unread correct; user with assignments but no messages appears with null last_message; ordering", async () => {
  const admin = await makeUser("admin", "inboxAdmin");
  const withMessages = await makeUser("user", "inboxWithMsgs");
  const assignmentOnly = await makeUser("user", "inboxAssignOnly");
  const untouched = await makeUser("user", "inboxUntouched"); // no messages, no assignments -> absent

  await insertMessage(withMessages, "kyle", "First");
  await insertMessage(withMessages, "user", "Reply one");
  await insertMessage(withMessages, "user", "Reply two");

  const workoutId = await makeWorkout(admin);
  await makeAssignment(assignmentOnly, workoutId, admin, "2026-09-10");

  const adminCookie = await signIn(admin);
  const res = await fetch(`${baseUrl}/api/admin/inbox`, { headers: authHeaders(adminCookie) });
  assert.equal(res.status, 200);
  const rows = await res.json();

  const withMsgRow = rows.find((r) => r.user.id === withMessages.id);
  assert.ok(withMsgRow, "athlete with messages appears");
  assert.equal(withMsgRow.last_message.sender, "user");
  assert.equal(withMsgRow.last_message.body, "Reply two");
  assert.equal(withMsgRow.unread, 2, "both user-sent rows are unread");

  const assignOnlyRow = rows.find((r) => r.user.id === assignmentOnly.id);
  assert.ok(assignOnlyRow, "athlete with an assignment but no messages appears");
  assert.equal(assignOnlyRow.last_message, null);
  assert.equal(assignOnlyRow.unread, 0);

  assert.ok(!rows.some((r) => r.user.id === untouched.id), "athlete with neither messages nor assignments is absent");
  assert.ok(!rows.some((r) => r.user.id === admin.id), "admin never appears in their own inbox");

  // withMessages has a real last message (non-null created_at) and should
  // sort before assignmentOnly, whose last_message is null (nulls last).
  const withMsgIdx = rows.findIndex((r) => r.user.id === withMessages.id);
  const assignOnlyIdx = rows.findIndex((r) => r.user.id === assignmentOnly.id);
  assert.ok(withMsgIdx < assignOnlyIdx, "athlete with a real last message sorts before one with none");
});
