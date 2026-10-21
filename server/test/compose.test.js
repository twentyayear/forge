// server/test/compose.test.js — W.5 compose, broadcast and unread-nudge tests. Same refuse-to-run guards and
// in-process boot pattern as messages.test.js. Runs ONLY against TEST_DATABASE_URL.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import pg from "pg";
import { makeTrainer, makeClient, signIn as signInWith, authHeaders } from "./helpers.js";

const { TEST_DATABASE_URL, DATABASE_URL } = process.env;

if (!TEST_DATABASE_URL) {
  console.error("FATAL: TEST_DATABASE_URL is not set. Refusing to run compose tests.");
  process.exit(1);
}
if (TEST_DATABASE_URL === DATABASE_URL) {
  console.error(
    "FATAL: TEST_DATABASE_URL equals DATABASE_URL. Refusing to run compose tests against a non-test database."
  );
  process.exit(1);
}
if (process.env.NODE_ENV !== "test") {
  console.error("FATAL: NODE_ENV must be 'test' to run compose tests (mailer and Claude would go live otherwise).");
  process.exit(1);
}

const { Pool } = pg;
const pool = new Pool({ connectionString: TEST_DATABASE_URL });

const { createApp } = await import("../app.js");
const { calls, testControls } = await import("../ai.js");
const { outbox, kyleSubject } = await import("../mail.js");
const { runUnreadNudge } = await import("../jobs.js");

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

async function nameOf(u) {
  return (await q(`SELECT name FROM users WHERE id = $1`, [u.id]))[0].name;
}

test("compose: two clients, one draft each citing their own score, nothing written", async () => {
  const w = await world();
  await q(`INSERT INTO checkins (user_id, day, score, answers) VALUES ($1, CURRENT_DATE - 3, 41, '{}'), ($1, CURRENT_DATE, 73, '{}')`, [w.a1.id]);
  await q(`INSERT INTO checkins (user_id, day, score, answers) VALUES ($1, CURRENT_DATE, 58, '{}')`, [w.a2.id]);
  const before = calls.length;

  const res = await call("POST", "/api/admin/compose", {
    cookie: w.kyleCookie,
    body: { user_ids: [w.a1.id, w.a2.id], intent: "checkin", notes: "ask about sleep" },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.drafts.length, 2);
  const d1 = res.json.drafts.find((d) => d.user_id === w.a1.id);
  const d2 = res.json.drafts.find((d) => d.user_id === w.a2.id);
  assert.ok(d1.body.includes("73"), d1.body);
  assert.ok(d2.body.includes("58"), d2.body);
  assert.equal(calls.length - before, 2);

  const n1 = await nameOf(w.a1);
  const n2 = await nameOf(w.a2);
  for (const c of calls.slice(before)) {
    assert.ok(c.system.includes("checkin") && c.system.includes("DATA"));
    const mine = c.userContent.includes(n1) ? n1 : n2;
    const theirs = mine === n1 ? n2 : n1;
    assert.ok(c.userContent.includes(mine));
    assert.ok(!c.userContent.includes(theirs));
  }

  const ids = [w.a1.id, w.a2.id];
  assert.equal((await q(`SELECT COUNT(*)::int AS n FROM messages WHERE user_id = ANY($1::uuid[])`, [ids]))[0].n, 0);
  assert.equal((await q(`SELECT COUNT(*)::int AS n FROM ai_drafts WHERE user_id = ANY($1::uuid[])`, [ids]))[0].n, 0);

});

test("compose: six ids is 400, a foreign client is 404 with no generation, a failed generation is a null body", async () => {
  const w = await world();
  const six = Array.from({ length: 6 }, () => crypto.randomUUID());
  assert.equal((await call("POST", "/api/admin/compose", { cookie: w.kyleCookie, body: { user_ids: six, intent: "checkin" } })).status, 400);

  const mark = calls.length;
  const foreign = await call("POST", "/api/admin/compose", { cookie: w.kyleCookie, body: { user_ids: [w.a1.id, w.b1.id], intent: "checkin" } });
  assert.equal(foreign.status, 404);
  assert.equal(calls.length, mark);

  testControls.forceFailure = true;
  try {
    const failed = await call("POST", "/api/admin/compose", { cookie: w.kyleCookie, body: { user_ids: [w.a1.id], intent: "encourage" } });
    assert.equal(failed.status, 200);
    assert.deepEqual(failed.json.drafts, [{ user_id: w.a1.id, body: null, error: "generation_failed" }]);
  } finally {
    testControls.forceFailure = false;
  }
});

test("broadcast: one message and one ledger row per client, not deduped across broadcasts", async () => {
  const w = await world();
  const ids = [w.a1.id, w.a2.id];
  const text = "Great week everyone.\n\nKeep the squat depth honest & steady this week, please.";
  const out0 = outbox.length;

  const res = await call("POST", "/api/admin/messages/broadcast", { cookie: w.kyleCookie, body: { user_ids: ids, body: text, email: true } });
  assert.equal(res.status, 200);
  assert.equal(res.json.sent.length, 2);
  assert.ok(res.json.sent.every((s) => s.emailed === true));
  const msgs = await q(`SELECT id, sender FROM messages WHERE user_id = ANY($1::uuid[])`, [ids]);
  assert.equal(msgs.length, 2);
  assert.ok(msgs.every((m) => m.sender === "kyle"));
  assert.equal((await q(`SELECT COUNT(*)::int AS n FROM message_emails WHERE message_id = ANY($1::uuid[])`, [msgs.map((m) => m.id)]))[0].n, 2);
  const sentMail = outbox.slice(out0);
  assert.equal(sentMail.length, 2);
  assert.ok(sentMail.every((m) => m.kind === "message" && m.body === text.trim()));
  assert.equal(kyleSubject(text), "Kyle: " + text.replace(/\s+/g, " ").slice(0, 48));
  assert.equal(kyleSubject(text).length, 6 + 48);

  // A BROADCAST IS NOT DEDUPED: THE LEDGER IS PER MESSAGE.
  const again = await call("POST", "/api/admin/messages/broadcast", { cookie: w.kyleCookie, body: { user_ids: ids, body: text, email: true } });
  assert.equal(again.status, 200);
  assert.equal((await q(`SELECT COUNT(*)::int AS n FROM messages WHERE user_id = ANY($1::uuid[])`, [ids]))[0].n, 4);
  assert.equal((await q(`SELECT COUNT(*)::int AS n FROM message_emails WHERE message_id IN (SELECT id FROM messages WHERE user_id = ANY($1::uuid[]))`, [ids]))[0].n, 4);
  assert.equal(outbox.length - out0, 4);

});

test("broadcast: opt-out and email:false write the message but no ledger row or email", async () => {
  const w = await world();
  const patch = await call("PATCH", "/api/profile", { cookie: w.a1Cookie, body: { emailMessages: false } });
  assert.equal(patch.status, 200);
  assert.equal((await call("PATCH", "/api/profile", { cookie: w.a1Cookie, body: { emailMessages: "no" } })).status, 400);
  const out1 = outbox.length;
  const optOut = await call("POST", "/api/admin/messages/broadcast", { cookie: w.kyleCookie, body: { user_ids: [w.a1.id], body: "opt out check", email: true } });
  assert.equal(optOut.status, 200);
  assert.equal(optOut.json.sent[0].emailed, false);
  assert.equal((await q(`SELECT COUNT(*)::int AS n FROM messages WHERE id = $1`, [optOut.json.sent[0].message_id]))[0].n, 1);
  assert.equal((await q(`SELECT COUNT(*)::int AS n FROM message_emails WHERE message_id = $1`, [optOut.json.sent[0].message_id]))[0].n, 0);
  assert.equal(outbox.length, out1);

  const noEmail = await call("POST", "/api/admin/messages/broadcast", { cookie: w.kyleCookie, body: { user_ids: [w.a2.id], body: "no email please", email: false } });
  assert.equal(noEmail.status, 200);
  assert.equal((await q(`SELECT COUNT(*)::int AS n FROM message_emails WHERE message_id = $1`, [noEmail.json.sent[0].message_id]))[0].n, 0);
  assert.equal(outbox.length, out1);

});

test("broadcast: a foreign client is 404 and writes nothing; an invalid body is 400", async () => {
  const w = await world();
  const ids = [w.a1.id, w.a2.id];
  const out1 = outbox.length;
  const msgCount = async () => (await q(`SELECT COUNT(*)::int AS n FROM messages WHERE user_id = ANY($1::uuid[])`, [[w.a1.id, w.a2.id, w.b1.id]]))[0].n;
  const n0 = await msgCount();
  const foreign = await call("POST", "/api/admin/messages/broadcast", { cookie: w.kyleCookie, body: { user_ids: [w.a1.id, w.b1.id], body: "x", email: true } });
  assert.equal(foreign.status, 404);
  assert.equal(await msgCount(), n0);
  assert.equal(outbox.length, out1);

  for (const bad of ["", "   ", "x".repeat(2001), 5]) {
    const r = await call("POST", "/api/admin/messages/broadcast", { cookie: w.kyleCookie, body: { user_ids: ids, body: bad, email: true } });
    assert.equal(r.status, 400, JSON.stringify(bad).slice(0, 20));
  }
  assert.equal(await msgCount(), n0);
});

test("unread nudge: emails only the old unread opted-in message, once", async () => {
  // THE SCRATCH DB PERSISTS BETWEEN RUNS: CLEAR OLD UNREAD KYLE MESSAGES LEFT BY EARLIER RUNS SO THE COUNTS BELOW ARE EXACT.
  await q(`UPDATE messages SET read_at = now() WHERE sender = 'kyle' AND read_at IS NULL AND created_at < now() - interval '24 hours'`);
  const w = await world();
  const seed = async (user, hoursAgo, readAt = null) =>
    (await q(
      `INSERT INTO messages (user_id, sender, body, read_at, created_at)
       VALUES ($1, 'kyle', $2, $3, now() - ($4 || ' hours')::interval) RETURNING id`,
      [user.id, `nudge ${rnd()}`, readAt, String(hoursAgo)]
    ))[0].id;

  const old = await seed(w.a1, 25);
  await seed(w.a1, 2);
  await seed(w.a1, 25, new Date());
  await q(`UPDATE users SET profile = '{"emailMessages": false}'::jsonb WHERE id = $1`, [w.a2.id]);
  await seed(w.a2, 25);

  const sentTo = [];
  const fake = async (email, args) => {
    sentTo.push({ email, args });
    return { ok: true, id: "fake" };
  };
  const first = await runUnreadNudge(pool, { sendKyleMessage: fake, appUrl: "https://example.test" });
  assert.equal(first.sent, 1);
  assert.equal(first.candidates, 1);
  assert.equal(sentTo.length, 1);
  assert.equal(sentTo[0].email, w.a1.email);
  assert.equal(sentTo[0].args.appUrl, "https://example.test");
  assert.equal((await q(`SELECT COUNT(*)::int AS n FROM message_emails WHERE message_id = $1`, [old]))[0].n, 1);

  const second = await runUnreadNudge(pool, { sendKyleMessage: fake, appUrl: "https://example.test" });
  assert.equal(second.sent, 0);
  assert.ok(second.skipped >= 1);
  assert.equal(sentTo.length, 1);

});

test("unread nudge: a failed send leaves no ledger row; the manual routes answer 200", async () => {
  await q(`UPDATE messages SET read_at = now() WHERE sender = 'kyle' AND read_at IS NULL AND created_at < now() - interval '24 hours'`);
  const w = await world();
  const fresh = (await q(
    `INSERT INTO messages (user_id, sender, body, created_at) VALUES ($1, 'kyle', 'failing nudge', now() - interval '30 hours') RETURNING id`,
    [w.a1.id]
  ))[0].id;
  const failing = await runUnreadNudge(pool, { sendKyleMessage: async () => ({ ok: false }), appUrl: "" });
  assert.equal(failing.failed, 1);
  assert.equal(failing.sent, 0);
  assert.equal((await q(`SELECT COUNT(*)::int AS n FROM message_emails WHERE message_id = $1`, [fresh]))[0].n, 0);
  await q(`UPDATE messages SET read_at = now() WHERE id = $1`, [fresh]);

  const route = await call("POST", "/api/admin/jobs/unread-nudge/run", { cookie: w.kyleCookie, body: {} });
  assert.equal(route.status, 200);
  assert.deepEqual(Object.keys(route.json).sort(), ["candidates", "failed", "sent", "skipped"]);
  assert.ok(Object.values(route.json).every((n) => Number.isInteger(n)));

  const monitor = await call("POST", "/api/admin/jobs/daily-monitor/run", { cookie: w.kyleCookie, body: {} });
  assert.equal(monitor.status, 200);
});
