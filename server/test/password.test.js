// server/test/password.test.js — password login + set-password script.
// Runs ONLY against TEST_DATABASE_URL (same guards as auth.test.js). All
// passwords are random throwaway values generated per test.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { spawn } from "node:child_process";
import pg from "pg";
import { makeTrainer } from "./helpers.js";

const { TEST_DATABASE_URL, DATABASE_URL } = process.env;

if (!TEST_DATABASE_URL) {
  console.error("FATAL: TEST_DATABASE_URL is not set. Refusing to run password tests.");
  process.exit(1);
}
if (TEST_DATABASE_URL === DATABASE_URL) {
  console.error(
    "FATAL: TEST_DATABASE_URL equals DATABASE_URL. Refusing to run password tests against a non-test database."
  );
  process.exit(1);
}
if (process.env.NODE_ENV !== "test") {
  console.error("FATAL: NODE_ENV must be 'test' to run password tests.");
  process.exit(1);
}

const { Pool } = pg;
const pool = new Pool({ connectionString: TEST_DATABASE_URL });

const { createApp } = await import("../app.js");
const { hashPassword, verifyPassword } = await import("../password.js");

const app = createApp(pool);
const server = http.createServer(app);
let baseUrl;

before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

const randomPassword = () => crypto.randomBytes(18).toString("base64url");

// ONE TRAINER PER FILE: A CLIENT ROW MUST CARRY ITS TRAINER (USERS_TRAINER_BY_ROLE CHECK).
let trainer;

before(async () => {
  trainer = await makeTrainer(pool, "fileTrainer");
});

async function makeUser(role, label, { withPassword = true } = {}) {
  const email = `${label}.${process.hrtime.bigint()}@pw-test.local`;
  const password = randomPassword();
  const hash = withPassword ? await hashPassword(password) : null;
  const { rows } = await pool.query(
    `INSERT INTO users (email, name, role, password_hash, trainer_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, email`,
    [email, label, role, hash, role === "user" ? trainer.id : null]
  );
  return { ...rows[0], password };
}

function login(body) {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getSessionCookie(res) {
  const raw = res.headers.get("set-cookie");
  const match = raw && raw.match(/wh_session=([^;]+)/);
  return match ? match[1] : null;
}

async function signIn(user) {
  const res = await login({ email: user.email, password: user.password });
  assert.equal(res.status, 200);
  return getSessionCookie(res);
}

const getWith = (path, cookie) => fetch(`${baseUrl}${path}`, { headers: { cookie: `wh_session=${cookie}` } });

test("hashPassword/verifyPassword: round trip, wrong, malformed, salted", async () => {
  const pw = randomPassword();
  const h1 = await hashPassword(pw);
  const h2 = await hashPassword(pw);
  assert.ok(h1.startsWith("scrypt$16384$8$1$"));
  assert.notEqual(h1, h2);
  assert.equal(await verifyPassword(pw, h1), true);
  assert.equal(await verifyPassword(pw + "x", h1), false);
  for (const bad of [null, undefined, "", "garbage", "scrypt$1$2$3", "scrypt$x$y$z$a$b", 42]) {
    assert.equal(await verifyPassword(pw, bad), false);
  }
});

test("login happy path: 200, cookie, /me works", async () => {
  const user = await makeUser("user", "happy");
  const res = await login({ email: user.email, password: user.password });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  const cookie = getSessionCookie(res);
  assert.ok(cookie);
  const me = await getWith("/api/auth/me", cookie);
  assert.equal(me.status, 200);
  assert.equal((await me.json()).email, user.email);
});

test("login is case-insensitive on email (citext)", async () => {
  const user = await makeUser("user", "casey");
  const res = await login({ email: user.email.toUpperCase(), password: user.password });
  assert.equal(res.status, 200);
});

test("wrong password, unknown email, null hash: identical 401", async () => {
  const user = await makeUser("user", "wrongpw");
  const nohash = await makeUser("user", "nohash", { withPassword: false });
  const bodies = [];
  for (const attempt of [
    { email: user.email, password: randomPassword() },
    { email: `nobody.${process.hrtime.bigint()}@pw-test.local`, password: randomPassword() },
    { email: nohash.email, password: nohash.password },
  ]) {
    const res = await login(attempt);
    assert.equal(res.status, 401);
    bodies.push(await res.text());
  }
  assert.equal(bodies[0], bodies[1]);
  assert.equal(bodies[1], bodies[2]);
  assert.deepEqual(JSON.parse(bodies[0]), { error: "invalid_credentials" });
});

test("malformed login bodies: 400 invalid_request", async () => {
  const user = await makeUser("user", "badbody");
  for (const body of [{ email: user.email }, { password: randomPassword() }, { email: user.email, password: 12345678901 }]) {
    const res = await login(body);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "invalid_request" });
  }
});

test("11th login attempt for the same email is rate limited (429)", async () => {
  const user = await makeUser("user", "ratelimit");
  const statuses = [];
  for (let i = 0; i < 11; i++) {
    const res = await login({ email: user.email, password: randomPassword() });
    statuses.push(res.status);
  }
  assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401));
  assert.equal(statuses[10], 429);
});

test("responses never contain password_hash or scrypt$", async () => {
  const user = await makeUser("user", "leakuser");
  const admin = await makeUser("admin", "leakadmin");
  await pool.query(`UPDATE users SET trainer_id = $1 WHERE id = $2`, [admin.id, user.id]);
  const userCookie = await signIn(user);
  const adminCookie = await signIn(admin);
  const paths = [
    ["/api/auth/me", userCookie],
    ["/api/bootstrap", userCookie],
    ["/api/auth/me", adminCookie],
    ["/api/admin/users", adminCookie],
    [`/api/admin/users/${user.id}/overview`, adminCookie],
  ];
  for (const [path, cookie] of paths) {
    const res = await getWith(path, cookie);
    assert.equal(res.status, 200, path);
    const text = await res.text();
    assert.ok(!text.includes("password_hash"), `${path} leaks password_hash`);
    assert.ok(!text.includes("scrypt$"), `${path} leaks a hash`);
  }
});

function runSetPassword(email, stdinText) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/set-password.js", email], {
      cwd: new URL("..", import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", () => {});
    child.on("close", (code) => resolve({ code, stdout }));
    child.stdin.end(stdinText);
  });
}

test("set-password.js: valid, unknown email, too-short", async () => {
  const user = await makeUser("user", "setpw", { withPassword: false });
  const pw = randomPassword();

  const ok = await runSetPassword(user.email, pw + "\n");
  assert.equal(ok.code, 0);
  assert.equal(ok.stdout, `password set for ${user.email}\n`);
  const { rows } = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [user.id]);
  assert.equal(await verifyPassword(pw, rows[0].password_hash), true);

  const unknown = await runSetPassword(`nobody.${process.hrtime.bigint()}@pw-test.local`, randomPassword() + "\n");
  assert.equal(unknown.code, 1);

  const short = await runSetPassword(user.email, "abcde\n");
  assert.equal(short.code, 1);
  const after = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [user.id]);
  assert.equal(after.rows[0].password_hash, rows[0].password_hash);
});
