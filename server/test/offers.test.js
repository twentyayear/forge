// server/test/offers.test.js — W.5 offers and history tests. Same refuse-to-run guards and
// in-process boot pattern as messages.test.js. Runs ONLY against TEST_DATABASE_URL.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import pg from "pg";
import { makeTrainer, makeClient, signIn as signInWith, authHeaders } from "./helpers.js";

const { TEST_DATABASE_URL, DATABASE_URL } = process.env;

if (!TEST_DATABASE_URL) {
  console.error("FATAL: TEST_DATABASE_URL is not set. Refusing to run offers tests.");
  process.exit(1);
}
if (TEST_DATABASE_URL === DATABASE_URL) {
  console.error(
    "FATAL: TEST_DATABASE_URL equals DATABASE_URL. Refusing to run offers tests against a non-test database."
  );
  process.exit(1);
}
if (process.env.NODE_ENV !== "test") {
  console.error("FATAL: NODE_ENV must be 'test' to run offers tests (mailer and Claude would go live otherwise).");
  process.exit(1);
}

const { Pool } = pg;
const pool = new Pool({ connectionString: TEST_DATABASE_URL });

const { createApp } = await import("../app.js");

const signIn = (user) => signInWith(pool, user);

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

async function call(method, path, { cookie, body } = {}) {
  const init = { method, headers: cookie ? { ...authHeaders(cookie) } : {} };
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
    // EMPTY OR NON-JSON BODY (204, 404)
  }
  return { status: res.status, json, text };
}

const q = async (sql, params) => (await pool.query(sql, params)).rows;
const rnd = () => crypto.randomBytes(4).toString("hex");

// TWO TRAINERS, EACH WITH CLIENTS; B IS THE FOREIGN TENANT.
async function world() {
  const kyle = await makeTrainer(pool, `kyle${rnd()}`);
  const other = await makeTrainer(pool, `other${rnd()}`);
  const a1 = await makeClient(pool, kyle, `zq${rnd()}`);
  const a2 = await makeClient(pool, kyle, `zq${rnd()}`);
  const b1 = await makeClient(pool, other, `zq${rnd()}`);
  return {
    kyle, other, a1, a2, b1,
    kyleCookie: await signIn(kyle),
    otherCookie: await signIn(other),
    a1Cookie: await signIn(a1),
    a2Cookie: await signIn(a2),
    b1Cookie: await signIn(b1),
  };
}

const mkOffer = (cookie, over = {}) =>
  call("POST", "/api/admin/offers", { cookie, body: { title: `Offer ${rnd()}`, blurb: "a blurb", price_cents: 5000, kind: "session", ...over } });

test("offers: trainer CRUD and tenant scoping", async () => {
  const w = await world();
  for (const bad of [{ title: "" }, { price_cents: -1 }, { kind: "nope" }, { price_cents: 1.5 }]) {
    assert.equal((await mkOffer(w.kyleCookie, bad)).status, 400, JSON.stringify(bad));
  }
  const created = await mkOffer(w.kyleCookie);
  assert.equal(created.status, 201);
  const id = created.json.id;

  const list = await call("GET", "/api/admin/offers", { cookie: w.kyleCookie });
  assert.equal(list.status, 200);
  const row = list.json.find((o) => o.id === id);
  assert.equal(row.request_count, 0);

  const patched = await call("PATCH", `/api/admin/offers/${id}`, { cookie: w.kyleCookie, body: { active: false } });
  assert.equal(patched.status, 200);
  assert.equal((await q(`SELECT active FROM offers WHERE id = $1`, [id]))[0].active, false);
  assert.equal((await call("PATCH", `/api/admin/offers/${id}`, { cookie: w.kyleCookie, body: { title: "" } })).status, 400);

  assert.ok(!(await call("GET", "/api/admin/offers", { cookie: w.otherCookie })).json.some((o) => o.id === id));
  assert.equal((await call("PATCH", `/api/admin/offers/${id}`, { cookie: w.otherCookie, body: { title: "hijack" } })).status, 404);
  assert.equal((await call("DELETE", `/api/admin/offers/${id}`, { cookie: w.otherCookie })).status, 404);
  assert.equal((await q(`SELECT title FROM offers WHERE id = $1`, [id]))[0].title, created.json.title);

  assert.equal((await call("DELETE", `/api/admin/offers/${id}`, { cookie: w.kyleCookie })).status, 204);
  assert.equal((await q(`SELECT COUNT(*)::int AS n FROM offers WHERE id = $1`, [id]))[0].n, 0);
});

test("offers: client sees only the active offers of its own trainer and can request one once", async () => {
  const w = await world();
  const live = (await mkOffer(w.kyleCookie, { title: `Live ${rnd()}` })).json;
  const hidden = (await mkOffer(w.kyleCookie, { title: `Hidden ${rnd()}` })).json;
  await call("PATCH", `/api/admin/offers/${hidden.id}`, { cookie: w.kyleCookie, body: { active: false } });
  const foreign = (await mkOffer(w.otherCookie, { title: `Foreign ${rnd()}` })).json;

  const list = await call("GET", "/api/offers", { cookie: w.a1Cookie });
  assert.equal(list.status, 200);
  const ids = list.json.map((o) => o.id);
  assert.ok(ids.includes(live.id));
  assert.ok(!ids.includes(hidden.id));
  assert.ok(!ids.includes(foreign.id));
  assert.deepEqual(Object.keys(list.json[0]).sort(), ["blurb", "id", "kind", "price_cents", "title"]);

  const req = await call("POST", `/api/offers/${live.id}/request`, { cookie: w.a1Cookie, body: {} });
  assert.equal(req.status, 201);
  const msg = (await q(`SELECT sender, body FROM messages WHERE id = $1 AND user_id = $2`, [req.json.message_id, w.a1.id]))[0];
  assert.equal(msg.sender, "user");
  assert.equal(msg.body, `I'd like to book: ${live.title}`);
  assert.equal((await q(`SELECT COUNT(*)::int AS n FROM offer_requests WHERE id = $1 AND user_id = $2`, [req.json.request_id, w.a1.id]))[0].n, 1);

  assert.equal((await call("POST", `/api/offers/${live.id}/request`, { cookie: w.a1Cookie, body: {} })).status, 409);

  const countAll = async () => (await q(`SELECT (SELECT COUNT(*) FROM offer_requests WHERE user_id = $1)::int AS r, (SELECT COUNT(*) FROM messages WHERE user_id = $1)::int AS m`, [w.a2.id]))[0];
  const snap = await countAll();
  assert.equal((await call("POST", `/api/offers/${hidden.id}/request`, { cookie: w.a2Cookie, body: {} })).status, 404);
  assert.equal((await call("POST", `/api/offers/${foreign.id}/request`, { cookie: w.a2Cookie, body: {} })).status, 404);
  assert.deepEqual(await countAll(), snap);

});

test("offers: the trainer sees the request, closes it, and cannot delete an offer that has requests", async () => {
  const w = await world();
  const live = (await mkOffer(w.kyleCookie, { title: `Live ${rnd()}` })).json;
  const req = await call("POST", `/api/offers/${live.id}/request`, { cookie: w.a1Cookie, body: {} });
  assert.equal(req.status, 201);
  const inbox = await call("GET", "/api/admin/offer-requests", { cookie: w.kyleCookie });
  assert.equal(inbox.status, 200);
  const mine = inbox.json.find((r) => r.id === req.json.request_id);
  assert.equal(mine.user_name, await q(`SELECT name FROM users WHERE id = $1`, [w.a1.id]).then((r) => r[0].name));
  assert.equal(mine.offer_title, live.title);
  assert.equal(mine.offer_id, live.id);
  assert.equal((await call("GET", "/api/admin/offers", { cookie: w.kyleCookie })).json.find((o) => o.id === live.id).request_count, 1);

  assert.equal((await call("GET", "/api/admin/offer-requests", { cookie: w.otherCookie })).json.length, 0);
  assert.equal((await call("PATCH", `/api/admin/offer-requests/${req.json.request_id}`, { cookie: w.otherCookie, body: { status: "closed" } })).status, 404);

  assert.equal((await call("PATCH", `/api/admin/offer-requests/${req.json.request_id}`, { cookie: w.kyleCookie, body: { status: "closed" } })).status, 200);
  assert.ok(!(await call("GET", "/api/admin/offer-requests", { cookie: w.kyleCookie })).json.some((r) => r.id === req.json.request_id));

  const del = await call("DELETE", `/api/admin/offers/${live.id}`, { cookie: w.kyleCookie });
  assert.equal(del.status, 409);
  assert.equal(del.json.error, "has_requests");
});

test("history: 30-day window, days param, tenant isolation", async () => {
  const w = await world();
  const workout = (await q(`INSERT INTO workouts (created_by, title) VALUES ($1, 'Leg day') RETURNING id`, [w.kyle.id]))[0].id;
  const assign = (await q(
    `INSERT INTO workout_assignments (user_id, workout_id, scheduled_for, assigned_by) VALUES ($1, $2, CURRENT_DATE - 2, $3) RETURNING id`,
    [w.a1.id, workout, w.kyle.id]
  ))[0].id;
  const addLog = async (daysAgo, assignmentId = null) => {
    const id = (await q(
      `INSERT INTO workout_logs (user_id, assignment_id, performed_at) VALUES ($1, $2, now() - ($3 || ' days')::interval) RETURNING id`,
      [w.a1.id, assignmentId, String(daysAgo)]
    ))[0].id;
    await q(
      `INSERT INTO workout_log_sets (user_id, log_id, exercise_key, set_no, reps, weight_lbs) VALUES ($1, $2, 'squat', 2, 5, 225), ($1, $2, 'squat', 1, 5, 205), ($1, $2, 'bench_press', 1, 8, 135)`,
      [w.a1.id, id]
    );
    return id;
  };
  const l2 = await addLog(2, assign);
  const l20 = await addLog(20);
  await addLog(40);

  const res = await call("GET", "/api/history", { cookie: w.a1Cookie });
  assert.equal(res.status, 200);
  assert.equal(res.json.days, 30);
  assert.deepEqual(res.json.logs.map((l) => l.id), [l2, l20]);
  assert.equal(res.json.logs[0].workout_title, "Leg day");
  assert.equal(res.json.logs[1].workout_title, null);
  assert.deepEqual(res.json.logs[0].sets.map((s) => `${s.exercise_key}:${s.set_no}`), ["bench_press:1", "squat:1", "squat:2"]);

  assert.equal((await call("GET", "/api/history?days=5", { cookie: w.a1Cookie })).json.logs.length, 1);
  for (const bad of ["31", "0", "abc", "-1", "1.5"]) {
    assert.equal((await call("GET", `/api/history?days=${bad}`, { cookie: w.a1Cookie })).status, 400, bad);
  }
  assert.equal((await call("GET", "/api/history", { cookie: w.b1Cookie })).json.logs.length, 0);
});
