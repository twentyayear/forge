import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sessionFromAssignment, targetsHit, volume, lastSessionFor, sessionTotals, weekStrip, estMinutes, todayStr, sessionKey, percentVs, assignmentForDay, nextAssignment, previousLogVolume, hitsForLog, fmtVolume,
} from "./engine.js";

const assignment = {
  id: "a1", scheduled_for: "2026-10-21T00:00:00.000Z", status: "assigned", program_title: "Lower",
  workout: { title: "Lower A", blocks: [
    { exercise_key: "Barbell Bench Press", sets: [{ reps: 5, weight_lbs: 185 }, { reps: 5, weight_lbs: 185 }], rest_sec: 120, note: "brace" },
    { exercise_key: "Pull-Ups", sets: [{ reps: 8 }] },
  ] },
};

test("sessionFromAssignment maps blocks, defaults rest to 90, bodyweight weight null, targets copied", () => {
  const s = sessionFromAssignment(assignment);
  assert.equal(s.assignmentId, "a1");
  assert.equal(s.title, "Lower A");
  assert.equal(s.programTitle, "Lower");
  assert.equal(s.exercises.length, 2);
  const [bench, pull] = s.exercises;
  assert.equal(bench.restSec, 120);
  assert.equal(bench.note, "brace");
  assert.deepEqual(bench.rows[1], { set_no: 2, reps: 5, weight_lbs: 185, target_reps: 5, target_weight_lbs: 185, done: false });
  assert.equal(pull.restSec, 90);
  assert.equal(pull.rows[0].weight_lbs, null);
  assert.equal(pull.rows[0].target_weight_lbs, null);
  assert.equal(pull.info, null);
  assert.equal(bench.info.name, "Barbell Bench Press");
});

test("targetsHit and volume on mixed rows", () => {
  const rows = [
    { reps: 5, weight_lbs: 185, target_reps: 5, target_weight_lbs: 185, done: true },
    { reps: 4, weight_lbs: 185, target_reps: 5, target_weight_lbs: 185, done: true },
    { reps: 5, weight_lbs: 185, target_reps: 5, target_weight_lbs: 185, done: false },
    { reps: 10, weight_lbs: 20, done: true },
  ];
  assert.deepEqual(targetsHit(rows), { hit: 1, total: 3 });
  assert.equal(volume(rows), 5 * 185 + 4 * 185 + 200);
  assert.equal(volume([{ reps: 12, weight_lbs: null, done: true }]), 0);
});

test("lastSessionFor picks the newest log with the key and ignores others", () => {
  const logs = [
    { performed_at: "2026-10-01T10:00:00Z", sets: [{ exercise_key: "Squat", set_no: 1, reps: 5, weight_lbs: 135 }] },
    { performed_at: "2026-10-10T10:00:00Z", sets: [
      { exercise_key: "Squat", set_no: 2, reps: 5, weight_lbs: 185 },
      { exercise_key: "Squat", set_no: 1, reps: 5, weight_lbs: 175 },
      { exercise_key: "Row", set_no: 1, reps: 8, weight_lbs: 100 },
    ] },
    { performed_at: "2026-10-15T10:00:00Z", sets: [{ exercise_key: "Row", set_no: 1, reps: 8, weight_lbs: 105 }] },
  ];
  const last = lastSessionFor("Squat", logs);
  assert.equal(last.topWeight, 185);
  assert.equal(last.topReps, 5);
  assert.equal(last.volume, 5 * 185 + 5 * 175);
  assert.deepEqual(last.rows.map((r) => r.set_no), [1, 2]);
  assert.equal(lastSessionFor("Deadlift", logs), null);
});

test("sessionTotals sums across exercises", () => {
  const ex = [
    { rows: [{ reps: 5, weight_lbs: 100, target_reps: 5, target_weight_lbs: 100, done: true }, { reps: 5, weight_lbs: 100, target_reps: 5, target_weight_lbs: 100, done: false }] },
    { rows: [{ reps: 3, weight_lbs: 50, target_reps: 5, target_weight_lbs: 50, done: true }] },
  ];
  assert.deepEqual(sessionTotals(ex), { targetsHit: 1, targetsTotal: 3, volume: 500 + 150, setsDone: 2 });
});

test("weekStrip for a Wednesday: done, missed, today, assigned, rest", () => {
  const a = (day, status) => ({ id: day, scheduled_for: `${day}T00:00:00.000Z`, status });
  const strip = weekStrip([a("2026-10-19", "completed"), a("2026-10-20", "assigned"), a("2026-10-22", "assigned")], "2026-10-21");
  assert.deepEqual(strip.map((d) => d.date), ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
  assert.deepEqual(strip.map((d) => d.state), ["done", "missed", "today", "assigned", "rest", "rest", "rest"]);
  assert.deepEqual(strip.map((d) => d.label), ["M", "T", "W", "T", "F", "S", "S"]);
});

test("weekStrip across the 2026-11-01 DST change lists that day once", () => {
  const next = weekStrip([], "2026-11-04").map((d) => d.date);
  assert.equal(next.includes("2026-11-01"), false);
  assert.equal(next[0], "2026-11-02");
  const prior = weekStrip([], "2026-10-28").map((d) => d.date);
  assert.equal(prior.filter((d) => d === "2026-11-01").length, 1);
  assert.equal(prior.length, 7);
  assert.equal(prior[6], "2026-11-01");
  assert.equal(new Set(prior).size, 7);
});

test("estMinutes: sets x (rest + 45 s), nearest 5", () => {
  const ex = [{ restSec: 90, rows: new Array(4).fill({}) }, { restSec: 90, rows: new Array(4).fill({}) }];
  assert.equal(estMinutes(ex), 20);
  assert.equal(estMinutes([]), 0);
  assert.equal(estMinutes([{ restSec: 30, rows: [{}] }]), 5);
});

test("todayStr, sessionKey, percentVs", () => {
  assert.equal(todayStr(new Date(2026, 9, 5, 23, 30)), "2026-10-05");
  assert.equal(sessionKey("abc"), "workhart.session.abc");
  assert.equal(percentVs(110, 100), 10);
  assert.equal(percentVs(90, 100), -10);
  assert.equal(percentVs(5, 0), null);
});

test("assignmentForDay prefers an open one; nextAssignment is the soonest later open one; previousLogVolume is the newest log", () => {
  const a = (id, day, status) => ({ id, scheduled_for: `${day}T00:00:00.000Z`, status });
  const list = [a("x", "2026-10-21", "completed"), a("y", "2026-10-21", "assigned"), a("z", "2026-10-25", "assigned"), a("w", "2026-10-23", "assigned")];
  assert.equal(assignmentForDay(list, "2026-10-21").id, "y");
  assert.equal(assignmentForDay(list, "2026-10-22"), null);
  assert.equal(nextAssignment(list, "2026-10-21").id, "w");
  assert.equal(nextAssignment(list, "2026-10-25"), null);
  const logs = [
    { performed_at: "2026-10-01T10:00:00Z", sets: [{ reps: 5, weight_lbs: 100 }] },
    { performed_at: "2026-10-09T10:00:00Z", sets: [{ reps: 5, weight_lbs: 200 }] },
  ];
  assert.equal(previousLogVolume(logs), 1000);
  assert.equal(previousLogVolume([]), null);
});

test("hitsForLog scores a past log against its assignment targets; fmtVolume formats", () => {
  const asg = [{ id: "a", workout: { blocks: [{ exercise_key: "Squat", sets: [{ reps: 5, weight_lbs: 185 }, { reps: 5, weight_lbs: 185 }] }] } }];
  const log = { assignment_id: "a", sets: [{ exercise_key: "Squat", set_no: 1, reps: 5, weight_lbs: 185 }, { exercise_key: "Squat", set_no: 2, reps: 4, weight_lbs: 185 }] };
  assert.deepEqual(hitsForLog(log, asg), { hit: 1, total: 2 });
  assert.equal(hitsForLog({ assignment_id: "zz", sets: [] }, asg), null);
  assert.deepEqual(fmtVolume(3515), { value: "3,515", unit: "lb" });
  assert.deepEqual(fmtVolume(12400), { value: "12.4", unit: "k lb" });
});
