// server/test/ai.test.js — AI Kyle integration tests (U7, ask 33). Same
// refuse-to-run guards and in-process boot pattern as admin.test.js /
// messages.test.js. Runs ONLY against TEST_DATABASE_URL.
//
// generateDraft is fired via setImmediate right after the checkin/workout-log
// response is sent, so tests poll (draftForTrigger) rather than assume the
// row exists the instant the HTTP call returns.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import pg from "pg";

const { TEST_DATABASE_URL, DATABASE_URL } = process.env;

if (!TEST_DATABASE_URL) {
  console.error("FATAL: TEST_DATABASE_URL is not set. Refusing to run ai tests.");
  process.exit(1);
}
if (TEST_DATABASE_URL === DATABASE_URL) {
  console.error(
    "FATAL: TEST_DATABASE_URL equals DATABASE_URL. Refusing to run ai tests against a non-test database."
  );
  process.exit(1);
}
if (process.env.NODE_ENV !== "test") {
  console.error("FATAL: NODE_ENV must be 'test' to run ai tests (this would call the real Claude API otherwise).");
  process.exit(1);
}

const { Pool } = pg;
const pool = new Pool({ connectionString: TEST_DATABASE_URL });

const { createApp } = await import("../app.js");
const { testControls } = await import("../ai.js");

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
  return `${label}.${process.hrtime.bigint()}@ai-test.local`;
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

function jsonHeaders(cookie) {
  return { ...authHeaders(cookie), "content-type": "application/json" };
}

async function waitFor(fn, { timeout = 2000, interval = 20 } = {}) {
  const start = Date.now();
  for (;;) {
    const result = await fn();
    if (result) return result;
    if (Date.now() - start > timeout) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, interval));
  }
}

// Poll for the ai_drafts row created by a specific trigger (not just "most
// recent of this type" -- a prior draft for the same user/type would
// otherwise satisfy that query before the new one lands).
async function draftForTrigger(userId, triggerType, triggerId) {
  return waitFor(async () => {
    const { rows } = await pool.query(
      `SELECT * FROM ai_drafts WHERE user_id = $1 AND trigger_type = $2 AND trigger_id = $3`,
      [userId, triggerType, triggerId]
    );
    return rows[0] || null;
  });
}

async function postCheckin(cookie, day, score) {
  const res = await fetch(`${baseUrl}/api/checkins`, {
    method: "POST",
    headers: jsonHeaders(cookie),
    body: JSON.stringify({ day, score, answers: { sleep: 7 } }),
  });
  return res;
}

test("checkin POST creates a pending draft citing a real number; a same-day repeat POST stays deduped to one", async () => {
  const user = await makeUser("user", "checkinDraft");
  const cookie = await signIn(user);
  const day = "2026-09-01";

  const post = await postCheckin(cookie, day, 61);
  assert.equal(post.status, 200);
  const checkin = await post.json();

  const draft = await draftForTrigger(user.id, "checkin", checkin.id);
  assert.equal(draft.status, "pending");
  assert.ok(draft.body.includes("61"), `draft body should cite the score 61: ${draft.body}`);

  // Same day -> the checkin upsert returns the SAME checkin id, so the
  // dedupe key (user_id, trigger_type, trigger_id) must skip a second insert.
  const post2 = await postCheckin(cookie, day, 61);
  assert.equal(post2.status, 200);
  const checkin2 = await post2.json();
  assert.equal(checkin2.id, checkin.id, "same-day upsert returns the same checkin id");

  await new Promise((r) => setTimeout(r, 150));
  const { rows } = await pool.query(
    `SELECT id FROM ai_drafts WHERE user_id = $1 AND trigger_type = 'checkin' AND status = 'pending'`,
    [user.id]
  );
  assert.equal(rows.length, 1, "still exactly one pending draft after the repeat POST");
});

test("workout-log POST creates a pending draft with trigger_type workout_log", async () => {
  const user = await makeUser("user", "workoutDraft");
  const cookie = await signIn(user);

  const post = await fetch(`${baseUrl}/api/workout-logs`, {
    method: "POST",
    headers: jsonHeaders(cookie),
    body: JSON.stringify({
      performed_at: new Date().toISOString(),
      sets: [{ exercise_key: "bench_press", set_no: 1, reps: 5, weight_lbs: 135 }],
    }),
  });
  assert.equal(post.status, 201);
  const log = await post.json();

  const draft = await draftForTrigger(user.id, "workout_log", log.id);
  assert.equal(draft.status, "pending");
  assert.ok(draft.body.includes("135"), `draft body should cite the 135lb set: ${draft.body}`);
});

test("admin approve sends the message and marks the draft sent+sent_message_id; approving again 404s", async () => {
  const admin = await makeUser("admin", "approveAdmin");
  const adminCookie = await signIn(admin);
  const user = await makeUser("user", "approveAthlete");
  const cookie = await signIn(user);

  const checkinRes = await postCheckin(cookie, "2026-09-02", 74);
  const checkin = await checkinRes.json();
  const draft = await draftForTrigger(user.id, "checkin", checkin.id);

  const approveRes = await fetch(`${baseUrl}/api/admin/drafts/${draft.id}/approve`, {
    method: "POST",
    headers: authHeaders(adminCookie),
  });
  assert.equal(approveRes.status, 200);
  const message = await approveRes.json();
  assert.equal(message.sender, "kyle");
  assert.equal(message.ai_generated, true);
  assert.equal(message.body, draft.body);

  const { rows: draftRows } = await pool.query(
    `SELECT status, sent_message_id FROM ai_drafts WHERE id = $1`,
    [draft.id]
  );
  assert.equal(draftRows[0].status, "sent");
  assert.equal(draftRows[0].sent_message_id, message.id);

  const athleteMsgs = await fetch(`${baseUrl}/api/messages`, { headers: authHeaders(cookie) });
  const rows = await athleteMsgs.json();
  assert.ok(rows.some((m) => m.id === message.id), "athlete sees the approved message");

  const approveAgain = await fetch(`${baseUrl}/api/admin/drafts/${draft.id}/approve`, {
    method: "POST",
    headers: authHeaders(adminCookie),
  });
  assert.equal(approveAgain.status, 404);
});

test("editing a draft then approving carries the edited body; reject works and a rejected draft can't be approved", async () => {
  const admin = await makeUser("admin", "editAdmin");
  const adminCookie = await signIn(admin);
  const user = await makeUser("user", "editAthlete");
  const cookie = await signIn(user);

  const checkin1Res = await postCheckin(cookie, "2026-09-03", 55);
  const checkin1 = await checkin1Res.json();
  const draft1 = await draftForTrigger(user.id, "checkin", checkin1.id);

  const editRes = await fetch(`${baseUrl}/api/admin/drafts/${draft1.id}`, {
    method: "PATCH",
    headers: jsonHeaders(adminCookie),
    body: JSON.stringify({ body: "Edited by Kyle: great score, keep it up." }),
  });
  assert.equal(editRes.status, 200);
  const edited = await editRes.json();
  assert.equal(edited.body, "Edited by Kyle: great score, keep it up.");

  const approveRes = await fetch(`${baseUrl}/api/admin/drafts/${draft1.id}/approve`, {
    method: "POST",
    headers: authHeaders(adminCookie),
  });
  assert.equal(approveRes.status, 200);
  const message = await approveRes.json();
  assert.equal(message.body, "Edited by Kyle: great score, keep it up.");

  // Reject path -- a second checkin/draft for the same athlete.
  const checkin2Res = await postCheckin(cookie, "2026-09-04", 60);
  const checkin2 = await checkin2Res.json();
  const draft2 = await draftForTrigger(user.id, "checkin", checkin2.id);
  assert.notEqual(draft2.id, draft1.id);

  const rejectRes = await fetch(`${baseUrl}/api/admin/drafts/${draft2.id}/reject`, {
    method: "POST",
    headers: authHeaders(adminCookie),
  });
  assert.equal(rejectRes.status, 200);
  const rejected = await rejectRes.json();
  assert.equal(rejected.status, "rejected");

  const approveRejected = await fetch(`${baseUrl}/api/admin/drafts/${draft2.id}/approve`, {
    method: "POST",
    headers: authHeaders(adminCookie),
  });
  assert.equal(approveRejected.status, 404);
});

test("kyleAutoSend true auto-sends: checkin POST yields a message directly, draft already status sent, no pending row", async () => {
  const admin = await makeUser("admin", "autoSendAdmin");
  const adminCookie = await signIn(admin);
  const user = await makeUser("user", "autoSendAthlete");
  const cookie = await signIn(user);

  const settingsRes = await fetch(`${baseUrl}/api/admin/users/${user.id}/settings`, {
    method: "PATCH",
    headers: jsonHeaders(adminCookie),
    body: JSON.stringify({ kyleAutoSend: true }),
  });
  assert.equal(settingsRes.status, 200);
  const profile = await settingsRes.json();
  assert.equal(profile.kyleAutoSend, true);

  const checkinRes = await postCheckin(cookie, "2026-09-05", 82);
  assert.equal(checkinRes.status, 200);
  const checkin = await checkinRes.json();

  const draft = await draftForTrigger(user.id, "checkin", checkin.id);
  assert.equal(draft.status, "sent");
  assert.ok(draft.sent_message_id, "draft carries the sent message id");

  const { rows: pendingRows } = await pool.query(
    `SELECT id FROM ai_drafts WHERE user_id = $1 AND status = 'pending'`,
    [user.id]
  );
  assert.equal(pendingRows.length, 0, "no pending draft when auto-send is on");

  const athleteMsgs = await fetch(`${baseUrl}/api/messages`, { headers: authHeaders(cookie) });
  const rows = await athleteMsgs.json();
  const msg = rows.find((m) => m.id === draft.sent_message_id);
  assert.ok(msg, "the auto-sent message appears in the athlete's own thread");
  assert.equal(msg.ai_generated, true);
});

test("a generation failure never affects the athlete's response and writes no draft row", async () => {
  const user = await makeUser("user", "failureAthlete");
  const cookie = await signIn(user);

  testControls.forceFailure = true;
  try {
    const res = await postCheckin(cookie, "2026-09-06", 40);
    assert.equal(res.status, 200);
    const checkin = await res.json();

    await new Promise((r) => setTimeout(r, 250));
    const { rows } = await pool.query(
      `SELECT id FROM ai_drafts WHERE user_id = $1 AND trigger_type = 'checkin' AND trigger_id = $2`,
      [user.id, checkin.id]
    );
    assert.equal(rows.length, 0, "no draft row written after a simulated generation failure");
  } finally {
    testControls.forceFailure = false;
  }
});

test("401/404 sweep on the new admin routes; settings PATCH rejects unknown keys; athlete /api/profile still can't set kyleAutoSend", async () => {
  const normal = await makeUser("user", "sweepNormal");
  const normalCookie = await signIn(normal);
  const admin = await makeUser("admin", "sweepAdmin");
  const adminCookie = await signIn(admin);

  const checkinRes = await postCheckin(normalCookie, "2026-09-07", 50);
  const checkin = await checkinRes.json();
  const seedDraft = await draftForTrigger(normal.id, "checkin", checkin.id);

  const calls = [
    { method: "GET", path: "/api/admin/drafts" },
    { method: "PATCH", path: `/api/admin/drafts/${seedDraft.id}`, body: { body: "x" } },
    { method: "POST", path: `/api/admin/drafts/${seedDraft.id}/approve` },
    { method: "POST", path: `/api/admin/drafts/${seedDraft.id}/reject` },
    { method: "PATCH", path: `/api/admin/users/${normal.id}/settings`, body: { kyleAutoSend: true } },
  ];

  for (const call of calls) {
    const noAuth = await fetch(`${baseUrl}${call.path}`, {
      method: call.method,
      headers: { "content-type": "application/json" },
      body: call.body ? JSON.stringify(call.body) : undefined,
    });
    assert.equal(noAuth.status, 401, `${call.method} ${call.path} with no session`);

    const nonAdmin = await fetch(`${baseUrl}${call.path}`, {
      method: call.method,
      headers: jsonHeaders(normalCookie),
      body: call.body ? JSON.stringify(call.body) : undefined,
    });
    assert.equal(nonAdmin.status, 404, `${call.method} ${call.path} for a non-admin session`);
  }

  // Seed draft must still be untouched (pending) -- the sweep above never
  // authenticated as admin.
  const { rows: stillPending } = await pool.query(`SELECT status FROM ai_drafts WHERE id = $1`, [seedDraft.id]);
  assert.equal(stillPending[0].status, "pending");

  const badSettingsUnknownKey = await fetch(`${baseUrl}/api/admin/users/${normal.id}/settings`, {
    method: "PATCH",
    headers: jsonHeaders(adminCookie),
    body: JSON.stringify({ foo: true }),
  });
  assert.equal(badSettingsUnknownKey.status, 400);

  const badSettingsExtraKey = await fetch(`${baseUrl}/api/admin/users/${normal.id}/settings`, {
    method: "PATCH",
    headers: jsonHeaders(adminCookie),
    body: JSON.stringify({ kyleAutoSend: true, extra: 1 }),
  });
  assert.equal(badSettingsExtraKey.status, 400);

  const unknownUserSettings = await fetch(
    `${baseUrl}/api/admin/users/00000000-0000-0000-0000-000000000000/settings`,
    {
      method: "PATCH",
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ kyleAutoSend: true }),
    }
  );
  assert.equal(unknownUserSettings.status, 404);

  const athleteProfilePatch = await fetch(`${baseUrl}/api/profile`, {
    method: "PATCH",
    headers: jsonHeaders(normalCookie),
    body: JSON.stringify({ kyleAutoSend: true }),
  });
  assert.equal(athleteProfilePatch.status, 400);
});
