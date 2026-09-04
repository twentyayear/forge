// server/test/media.test.js — /api/tts + /api/food route tests, plus pure
// helper tests for the sentence-break transform and the OFF hit mapper.
// Same refuse-to-run guards and in-process boot pattern as data.test.js.
// No fetch mocking, no live upstream calls: the route tests only exercise
// paths that return before any outbound fetch (401/400/503), and the pure
// helpers are tested directly against fixtures.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import pg from "pg";
import { addSentenceBreaks, mapOffHit } from "../media-lib.js";

const { TEST_DATABASE_URL, DATABASE_URL } = process.env;

if (!TEST_DATABASE_URL) {
  console.error("FATAL: TEST_DATABASE_URL is not set. Refusing to run media tests.");
  process.exit(1);
}
if (TEST_DATABASE_URL === DATABASE_URL) {
  console.error(
    "FATAL: TEST_DATABASE_URL equals DATABASE_URL. Refusing to run media tests against a non-test database."
  );
  process.exit(1);
}
if (process.env.NODE_ENV !== "test") {
  console.error("FATAL: NODE_ENV must be 'test' to run media tests.");
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
  return `${label}.${process.hrtime.bigint()}@media-test.local`;
}

function sha256(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function makeUser(label) {
  const email = uniqueEmail(label);
  const { rows } = await pool.query(
    `INSERT INTO users (email, name, role) VALUES ($1, $2, 'user') RETURNING id, email`,
    [email, label]
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

test("POST /api/tts and GET /api/food are 401 without a session", async () => {
  const ttsRes = await fetch(`${baseUrl}/api/tts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "hi", voice_id: "ZAIovxRU9FXNYmauX8CL" }),
  });
  assert.equal(ttsRes.status, 401);

  const foodRes = await fetch(`${baseUrl}/api/food?q=chicken`);
  assert.equal(foodRes.status, 401);
});

test("tts: 400 on empty text, 400 on any non-allowlisted voice_id, 503 when ELEVENLABS_API_KEY unset", async () => {
  const user = await makeUser("ttsUser");
  const cookie = await signIn(user);

  // The route checks ELEVENLABS_API_KEY before text/voice validation (same
  // order as the Netlify reference), so the 400 assertions need a key
  // present -- a dummy value is fine, these requests never reach the
  // upstream fetch. Save/restore so this doesn't leak into other tests.
  const savedKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "dummy_test_key_never_used_live";
  try {
    const emptyText = await fetch(`${baseUrl}/api/tts`, {
      method: "POST",
      headers: { ...authHeaders(cookie), "content-type": "application/json" },
      body: JSON.stringify({ text: "", voice_id: "ZAIovxRU9FXNYmauX8CL" }),
    });
    assert.equal(emptyText.status, 400);

    const badVoice = await fetch(`${baseUrl}/api/tts`, {
      method: "POST",
      headers: { ...authHeaders(cookie), "content-type": "application/json" },
      body: JSON.stringify({ text: "hello", voice_id: "some-other-voice" }),
    });
    assert.equal(badVoice.status, 400);
  } finally {
    if (savedKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = savedKey;
  }

  // Force-unset for this call regardless of ambient env, then restore.
  const savedKey2 = process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_API_KEY;
  try {
    const noKey = await fetch(`${baseUrl}/api/tts`, {
      method: "POST",
      headers: { ...authHeaders(cookie), "content-type": "application/json" },
      body: JSON.stringify({ text: "hello", voice_id: "ZAIovxRU9FXNYmauX8CL" }),
    });
    assert.equal(noKey.status, 503);
  } finally {
    if (savedKey2 !== undefined) process.env.ELEVENLABS_API_KEY = savedKey2;
  }
});

test("food: 400 on q below 2 chars and q above 40 chars", async () => {
  const user = await makeUser("foodUser");
  const cookie = await signIn(user);

  const tooShort = await fetch(`${baseUrl}/api/food?q=a`, { headers: authHeaders(cookie) });
  assert.equal(tooShort.status, 400);

  const tooLong = await fetch(`${baseUrl}/api/food?q=${"a".repeat(41)}`, { headers: authHeaders(cookie) });
  assert.equal(tooLong.status, 400);
});

test("addSentenceBreaks: inserts a break after each sentence-ending punctuation + space, leaves punctuation without a trailing space unchanged", () => {
  const input = "Welcome back. Push day! Ready?";
  const expected = 'Welcome back. <break time="0.6s" /> Push day! <break time="0.6s" /> Ready?';
  assert.equal(addSentenceBreaks(input), expected);

  const noTrailingSpace = "Just one sentence.";
  assert.equal(addSentenceBreaks(noTrailingSpace), noTrailingSpace);
});

test("mapOffHit: prefers per-serving, falls back to per-100g, joins brands array, drops nameless and all-zero-macro hits, rounds to 1 decimal", () => {
  const perServing = mapOffHit({
    product_name: "Protein Bar",
    brands: ["Quest", "Quest Nutrition"],
    serving_size: "60g",
    nutriments: {
      "energy-kcal_serving": 190.456,
      proteins_serving: 20.96,
      carbohydrates_serving: 15.04,
      fat_serving: 8.01,
      "energy-kcal_100g": 999,
    },
  });
  assert.deepEqual(perServing, {
    name: "Protein Bar",
    brand: "Quest, Quest Nutrition",
    unit: "60g",
    kcal: 190.5,
    protein: 21,
    carbs: 15,
    fat: 8,
  });

  const per100gFallback = mapOffHit({
    product_name: "Plain Oats",
    brands: "Quaker",
    nutriments: {
      "energy-kcal_100g": 379,
      proteins_100g: 13.2,
      carbohydrates_100g: 67.7,
      fat_100g: 7,
    },
  });
  assert.equal(per100gFallback.unit, "100 g");
  assert.equal(per100gFallback.brand, "Quaker");
  assert.equal(per100gFallback.kcal, 379);

  const nameless = mapOffHit({ nutriments: { "energy-kcal_100g": 100 } });
  assert.equal(nameless, null);

  const allZeroMacro = mapOffHit({
    product_name: "Water",
    nutriments: { "energy-kcal_100g": 0, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 0 },
  });
  assert.equal(allZeroMacro, null);
});
