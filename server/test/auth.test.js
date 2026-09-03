// server/test/auth.test.js — auth routes + user-scoping integration tests.
// Runs ONLY against TEST_DATABASE_URL (same refuse-to-run guard as
// schema.test.js). Boots the real app in-process on an ephemeral port with
// NODE_ENV=test, so mail.js captures magic links in `outbox` instead of
// calling Resend.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import pg from "pg";

const { TEST_DATABASE_URL, DATABASE_URL } = process.env;

if (!TEST_DATABASE_URL) {
  console.error("FATAL: TEST_DATABASE_URL is not set. Refusing to run auth tests.");
  process.exit(1);
}
if (TEST_DATABASE_URL === DATABASE_URL) {
  console.error(
    "FATAL: TEST_DATABASE_URL equals DATABASE_URL. Refusing to run auth tests against a non-test database."
  );
  process.exit(1);
}
if (process.env.NODE_ENV !== "test") {
  console.error("FATAL: NODE_ENV must be 'test' to run auth tests (mailer would call Resend otherwise).");
  process.exit(1);
}

const { Pool } = pg;
const pool = new Pool({ connectionString: TEST_DATABASE_URL });

const { createApp } = await import("../app.js");
const { outbox } = await import("../mail.js");

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

beforeEach(() => {
  outbox.length = 0;
});

function uniqueEmail(label) {
  return `${label}.${process.hrtime.bigint()}@auth-test.local`;
}

async function makeUser(role, label) {
  const email = uniqueEmail(label);
  const { rows } = await pool.query(
    `INSERT INTO users (email, name, role) VALUES ($1, $2, $3) RETURNING id, email`,
    [email, label, role]
  );
  return rows[0];
}

function sha256(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function extractToken(url) {
  // The link is `${APP_BASE_URL}/api/auth/verify?token=...` in real
  // environments, but tolerate a relative URL too (APP_BASE_URL unset).
  return new URL(url, baseUrl).searchParams.get("token");
}

function getSessionCookie(res) {
  const raw = res.headers.get("set-cookie");
  if (!raw) return null;
  const match = raw.match(/wh_session=([^;]+)/);
  return match ? match[1] : null;
}

async function requestLink(email) {
  return fetch(`${baseUrl}/api/auth/request-link`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

// Signs a user in via the real request-link -> verify flow and returns the
// session cookie value.
async function signIn(user) {
  await requestLink(user.email);
  const entry = outbox[outbox.length - 1];
  const token = extractToken(entry.url);
  const verifyRes = await fetch(`${baseUrl}/api/auth/verify?token=${token}`, { redirect: "manual" });
  return getSessionCookie(verifyRes);
}

test("happy path: request-link -> capture outbox -> verify -> cookie -> /api/auth/me", async () => {
  const user = await makeUser("user", "happy");

  const reqRes = await requestLink(user.email);
  assert.equal(reqRes.status, 200);
  assert.deepEqual(await reqRes.json(), { ok: true });

  assert.equal(outbox.length, 1);
  const { email: sentEmail, url } = outbox[0];
  assert.equal(sentEmail, user.email);
  const token = extractToken(url);
  assert.ok(token, "magic link url carries a token");

  const verifyRes = await fetch(`${baseUrl}/api/auth/verify?token=${token}`, { redirect: "manual" });
  assert.equal(verifyRes.status, 302);
  assert.equal(verifyRes.headers.get("location"), "/");
  const cookie = getSessionCookie(verifyRes);
  assert.ok(cookie, "session cookie set");

  const meRes = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: `wh_session=${cookie}` } });
  assert.equal(meRes.status, 200);
  const me = await meRes.json();
  assert.equal(me.email, user.email);
  assert.equal(me.role, "user");
});

test("reused magic link: second verify redirects to ?auth=expired, no new session", async () => {
  const user = await makeUser("user", "reuse");
  await requestLink(user.email);
  const token = extractToken(outbox[0].url);

  const first = await fetch(`${baseUrl}/api/auth/verify?token=${token}`, { redirect: "manual" });
  assert.equal(first.status, 302);
  assert.equal(first.headers.get("location"), "/");

  const { rows: before } = await pool.query(`SELECT count(*)::int AS n FROM sessions WHERE user_id = $1`, [
    user.id,
  ]);

  const second = await fetch(`${baseUrl}/api/auth/verify?token=${token}`, { redirect: "manual" });
  assert.equal(second.status, 302);
  assert.equal(second.headers.get("location"), "/?auth=expired");

  const { rows: after } = await pool.query(`SELECT count(*)::int AS n FROM sessions WHERE user_id = $1`, [
    user.id,
  ]);
  assert.equal(after[0].n, before[0].n, "no new session created on reuse");
});

test("expired magic link token is rejected", async () => {
  const user = await makeUser("user", "expired");
  const raw = crypto.randomBytes(32).toString("base64url");
  await pool.query(
    `INSERT INTO magic_link_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() - interval '1 minute')`,
    [user.id, sha256(raw)]
  );

  const res = await fetch(`${baseUrl}/api/auth/verify?token=${raw}`, { redirect: "manual" });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/?auth=expired");
});

test("logout deletes the session row; subsequent /me is 401", async () => {
  const user = await makeUser("user", "logout");
  const cookie = await signIn(user);
  assert.ok(cookie, "signed in");

  const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { cookie: `wh_session=${cookie}` },
  });
  assert.equal(logoutRes.status, 200);
  assert.deepEqual(await logoutRes.json(), { ok: true });

  const { rows } = await pool.query(`SELECT 1 FROM sessions WHERE token_hash = $1`, [sha256(cookie)]);
  assert.equal(rows.length, 0, "session row gone");

  const meRes = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: `wh_session=${cookie}` } });
  assert.equal(meRes.status, 401);
});

test("unknown email on request-link: generic 200, empty outbox, no token row", async () => {
  const email = uniqueEmail("nobody");
  const res = await requestLink(email);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(outbox.length, 0);

  const { rows } = await pool.query(
    `SELECT mlt.id FROM magic_link_tokens mlt JOIN users u ON u.id = mlt.user_id WHERE u.email = $1`,
    [email]
  );
  assert.equal(rows.length, 0);
});

test("IDOR: GET /api/checkins as user A never returns user B's rows", async () => {
  const userA = await makeUser("user", "idorA");
  const userB = await makeUser("user", "idorB");

  await pool.query(
    `INSERT INTO checkins (user_id, day, score, answers) VALUES ($1, '2026-09-01', 81, '{"tag":"A"}')`,
    [userA.id]
  );
  await pool.query(
    `INSERT INTO checkins (user_id, day, score, answers) VALUES ($1, '2026-09-01', 42, '{"tag":"B"}')`,
    [userB.id]
  );

  const cookieA = await signIn(userA);
  const res = await fetch(`${baseUrl}/api/checkins`, { headers: { cookie: `wh_session=${cookieA}` } });
  assert.equal(res.status, 200);
  const rows = await res.json();

  assert.equal(rows.length, 1, "only A's own checkin row comes back");
  assert.equal(rows[0].score, 81);
  assert.equal(rows[0].answers.tag, "A");
  assert.ok(!rows.some((r) => r.score === 42), "user B's row must never appear");
});

test("role gate: /api/admin/users is 404 for a normal user, 200 with the roster for admin", async () => {
  const normal = await makeUser("user", "roleuser");
  const admin = await makeUser("admin", "roleadmin");

  const normalCookie = await signIn(normal);
  const normalRes = await fetch(`${baseUrl}/api/admin/users`, {
    headers: { cookie: `wh_session=${normalCookie}` },
  });
  assert.equal(normalRes.status, 404);

  const adminCookie = await signIn(admin);
  const adminRes = await fetch(`${baseUrl}/api/admin/users`, {
    headers: { cookie: `wh_session=${adminCookie}` },
  });
  assert.equal(adminRes.status, 200);
  const rows = await adminRes.json();
  const ids = rows.map((r) => r.id);
  assert.ok(ids.includes(normal.id), "roster includes the normal user");
  assert.ok(ids.includes(admin.id), "roster includes the admin user");
});

test("rate limit: 6th request-link for the same email within the window is 429", async () => {
  const email = uniqueEmail("ratelimited");
  let last;
  for (let i = 0; i < 6; i++) {
    last = await requestLink(email);
  }
  assert.equal(last.status, 429);
});
