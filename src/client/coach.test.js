import { test } from "node:test";
import assert from "node:assert/strict";
import { groupByDay, priceLabel, setsByExercise, logVolume } from "./coach.js";

const now = new Date(2026, 9, 21, 15, 0); // Wed Oct 21, local

test("groupByDay groups and labels Today / Yesterday / weekday-date", () => {
  const msgs = [
    { id: 1, created_at: new Date(2026, 9, 19, 8, 0).toISOString() },
    { id: 2, created_at: new Date(2026, 9, 19, 9, 0).toISOString() },
    { id: 3, created_at: new Date(2026, 9, 20, 23, 59).toISOString() },
    { id: 4, created_at: new Date(2026, 9, 21, 0, 1).toISOString() },
  ];
  const g = groupByDay(msgs, now);
  assert.deepEqual(g.map((x) => x.label), ["Mon, Oct 19", "Yesterday", "Today"]);
  assert.deepEqual(g.map((x) => x.messages.length), [2, 1, 1]);
  assert.deepEqual(groupByDay([], now), []);
});

test("priceLabel formats cents and hides zero", () => {
  assert.equal(priceLabel(4500), "$45.00");
  assert.equal(priceLabel(5), "$0.05");
  assert.equal(priceLabel(0), "");
  assert.equal(priceLabel(null), "");
});

test("setsByExercise groups in first-seen order and logVolume skips bodyweight", () => {
  const sets = [
    { exercise_key: "Squat", set_no: 2, reps: 5, weight_lbs: 100 },
    { exercise_key: "Pull-Ups", set_no: 1, reps: 8, weight_lbs: null },
    { exercise_key: "Squat", set_no: 1, reps: 5, weight_lbs: 100 },
  ];
  const g = setsByExercise(sets);
  assert.deepEqual(g.map((x) => x.key), ["Squat", "Pull-Ups"]);
  assert.deepEqual(g[0].rows.map((r) => r.set_no), [1, 2]);
  assert.equal(logVolume(sets), 1000);
});

import { fillBlurb } from "./you.js";

test("fillBlurb fills exercise and program from context, with plain fallbacks", () => {
  assert.equal(fillBlurb("A new best on <exercise>.", { exercise: "Squat" }), "A new best on Squat.");
  assert.equal(fillBlurb("Every day of <program>, done.", { program: "Lower" }), "Every day of Lower, done.");
  assert.equal(fillBlurb("A new best on <exercise>.", null), "A new best on that lift.");
});
