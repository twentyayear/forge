// server/test/seed-programs.test.js — the six starter programs seed cleanly and never twice.
// Same refuse-to-run guards as the other suites. Runs ONLY against TEST_DATABASE_URL.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { makeTrainer } from "./helpers.js";

const { TEST_DATABASE_URL, DATABASE_URL } = process.env;
if (!TEST_DATABASE_URL) {
  console.error("FATAL: TEST_DATABASE_URL is not set. Refusing to run seed-programs tests.");
  process.exit(1);
}
if (TEST_DATABASE_URL === DATABASE_URL) {
  console.error("FATAL: TEST_DATABASE_URL equals DATABASE_URL. Refusing to run against a non-test database.");
  process.exit(1);
}

const { Pool } = pg;
const pool = new Pool({ connectionString: TEST_DATABASE_URL });
const { seedPrograms } = await import("../scripts/seed-programs.js");
const { PROGRAMS, WORKOUTS, programDays } = await import("../data/programs.js");

let trainer;
before(async () => {
  trainer = await makeTrainer(pool, "seedPrograms");
});
after(async () => {
  await pool.end();
});

test("catalog shape: six programs, every day names a workout in the catalog, every block is a valid shape", () => {
  assert.equal(PROGRAMS.length, 6);
  for (const p of PROGRAMS) {
    const days = programDays(p);
    assert.ok(days.length >= 9, `${p.title} has sessions`);
    assert.equal(new Set(days.map((d) => d.day_index)).size, days.length, `${p.title} day indexes are unique`);
    for (const d of days) assert.ok(WORKOUTS[d.workoutTitle], `${p.title}: ${d.workoutTitle} exists`);
  }
  for (const [title, w] of Object.entries(WORKOUTS)) {
    assert.ok(w.blocks.length >= 4, `${title} has blocks`);
    for (const b of w.blocks) {
      assert.ok(typeof b.exercise_key === "string" && b.exercise_key.length > 0);
      assert.ok(b.sets.length >= 1 && b.sets.length <= 10);
      for (const s of b.sets) {
        assert.ok(Number.isInteger(s.reps) && s.reps >= 1 && s.reps <= 200, `${title}: reps`);
        assert.ok(s.weight_lbs === null || (typeof s.weight_lbs === "number" && s.weight_lbs >= 0), `${title}: weight`);
      }
      assert.ok(Number.isInteger(b.rest_sec) && b.rest_sec > 0);
    }
  }
});

test("seed twice: the first run creates every workout, program and day; the second creates nothing", async () => {
  const first = await seedPrograms(pool, trainer.id);
  assert.equal(first.workoutsCreated, Object.keys(WORKOUTS).length);
  assert.equal(first.programsCreated, PROGRAMS.length);
  assert.equal(first.daysCreated, PROGRAMS.reduce((n, p) => n + programDays(p).length, 0));

  const second = await seedPrograms(pool, trainer.id);
  assert.deepEqual(second, { workoutsCreated: 0, programsCreated: 0, daysCreated: 0 });

  const { rows } = await pool.query(
    `SELECT p.title, count(pd.id)::int AS days, count(pd.workout_id)::int AS sessions
     FROM programs p LEFT JOIN program_days pd ON pd.program_id = p.id
     WHERE p.trainer_id = $1 GROUP BY p.title ORDER BY p.title`,
    [trainer.id]
  );
  assert.equal(rows.length, 6);
  for (const r of rows) assert.equal(r.days, r.sessions, `${r.title}: every day row carries a workout`);

  // THE SEEDED BLOCKS ROUND-TRIP AS JSON (NOT A POSTGRES ARRAY LITERAL).
  const { rows: w } = await pool.query(`SELECT blocks FROM workouts WHERE created_by = $1 AND title = 'Push'`, [trainer.id]);
  assert.ok(Array.isArray(w[0].blocks) && w[0].blocks[0].exercise_key === "Barbell Bench Press");
});
