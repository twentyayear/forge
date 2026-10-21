import test from "node:test";
import assert from "node:assert/strict";
import { realHistory, averageScore, buildServerHistoryCsv } from "./history.js";

const mk = (day, sets, assignment_id = null) => ({
  id: day, performed_at: `2026-09-${String(day).padStart(2, "0")}T12:00:00`, assignment_id,
  sets: sets.map(([exercise_key, set_no, reps, weight_lbs]) => ({ exercise_key, set_no, reps, weight_lbs, rpe: null })),
});

test("realHistory returns null with no sets", () => {
  assert.equal(realHistory("Squat", [mk(1, [["Bench", 1, 5, "135"]])]), null);
  assert.equal(realHistory("Squat", []), null);
});

test("weighted PR: heaviest, ties by reps, string weights", () => {
  const h = realHistory("Bench", [mk(4, [["Bench", 1, 3, "135"], ["Bench", 2, 5, "135"], ["Bench", 3, 8, "115"]])]);
  assert.equal(h.pr.label, "135 lb × 5");
  assert.equal(h.pr.date, "Sep 4");
});

test("bodyweight exercise", () => {
  const h = realHistory("Pull-up", [mk(1, [["Pull-up", 1, 8, null], ["Pull-up", 2, 10, null]])]);
  assert.equal(h.pr.label, "10 reps");
  assert.equal(h.baseMax, null);
  assert.deepEqual(h.series, []);
});

test("baseMax Epley rounded; series last 8 in order", () => {
  assert.equal(realHistory("Dead", [mk(1, [["Dead", 1, 5, "200"]])]).baseMax, 235);
  const logs = Array.from({ length: 10 }, (_, i) => mk(i + 1, [["Dead", 1, 5, String(100 + i * 10)]]));
  const s = realHistory("Dead", logs).series;
  assert.equal(s.length, 8);
  assert.equal(s[0].wk, "9/3");
  assert.equal(s[7].wk, "9/10");
  assert.ok(s[0].lb < s[7].lb);
});

test("averageScore", () => {
  assert.equal(averageScore({}), null);
  assert.equal(averageScore({ a: { score: 70 }, b: { score: 81 } }), 76);
});

test("buildServerHistoryCsv", () => {
  const logs = [
    mk(2, [["Bench", 1, 5, "135"], ["Row", 1, 8, "95"], ["Bench", 2, 5, "135"]], "a1"),
    mk(1, [["Squat", 1, 5, null]]),
  ];
  const csv = buildServerHistoryCsv(logs, [{ id: "a1", workout: { title: "Push, Pull" } }]);
  const lines = csv.split("\n");
  assert.equal(lines[0], "date,session,block,exercise,set,reps,weight_lb,volume_lb");
  assert.equal(lines.length, 5);
  assert.equal(lines[1], "2026-09-01,Workout,A,Squat,1,5,0,0");
  assert.equal(lines[2], '2026-09-02,"Push, Pull",A,Bench,1,5,135,675');
  assert.ok(lines[3].includes(",B,Row,"));
  assert.ok(lines[4].includes(",A,Bench,"));
});
