import { test } from "node:test";
import assert from "node:assert/strict";
import { weekRange, trendPoints, needsYouLabel, clientSubline, blocksFromEditor, groupByBody, dollarsToCents, priceLabel, programSessionCount, moveItem, ageLabel, inboxBadge, countOf } from "./trainer.js";

test("weekRange: a Wednesday and a Sunday both land in their Monday to Sunday", () => {
  assert.deepEqual(weekRange("2026-10-21"), { from: "2026-10-19", to: "2026-10-25" });
  assert.deepEqual(weekRange("2026-10-25"), { from: "2026-10-19", to: "2026-10-25" });
  assert.deepEqual(weekRange("2026-10-19"), { from: "2026-10-19", to: "2026-10-25" });
});

test("trendPoints: fills missing days with null and ends at today", () => {
  const pts = trendPoints([{ day: "2026-10-21T00:00:00.000Z", score: 70 }, { day: "2026-10-19", score: 55 }], 4, "2026-10-21");
  assert.deepEqual(pts.map((p) => p.day), ["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21"]);
  assert.deepEqual(pts.map((p) => p.score), [null, 55, null, 70]);
});

test("needsYouLabel covers the three kinds", () => {
  assert.equal(needsYouLabel({ kind: "missed", count: 2 }), "2 missed");
  assert.equal(needsYouLabel({ kind: "unread", count: 3 }), "Unread");
  assert.equal(needsYouLabel({ kind: "drafts", count: 1 }), "Review");
});

test("clientSubline with and without a next session", () => {
  assert.equal(clientSubline({ next: { title: "Lower A", scheduled_for: "2026-10-22" }, streak: 4 }), "Lower A Thu, Oct 22 · streak 4");
  assert.equal(clientSubline({ next: null, streak: 2 }), "No session scheduled");
});

test("blocksFromEditor: blank weight is null, rest and note only when set, reps at least 1", () => {
  const out = blocksFromEditor([
    { exercise_key: "Deadlift", sets: [{ reps: "5", weight_lbs: "225" }, { reps: 0, weight_lbs: "" }], rest_sec: "90", note: "  slow  " },
    { exercise_key: "Pull-Up", sets: [{ reps: 8, weight_lbs: null }], rest_sec: "", note: " " },
  ]);
  assert.deepEqual(out[0], { exercise_key: "Deadlift", sets: [{ reps: 5, weight_lbs: 225 }, { reps: 1, weight_lbs: null }], rest_sec: 90, note: "slow" });
  assert.deepEqual(out[1], { exercise_key: "Pull-Up", sets: [{ reps: 8, weight_lbs: null }] });
});

test("groupByBody groups identical text in first-seen order and drops blanks", () => {
  const out = groupByBody([
    { user_id: 1, body: "Walk tonight" }, { user_id: 2, body: "Lift Thursday" },
    { user_id: 3, body: " Walk tonight " }, { user_id: 4, body: "  " }, { user_id: 5, body: null },
  ]);
  assert.deepEqual(out, [{ body: "Walk tonight", user_ids: [1, 3] }, { body: "Lift Thursday", user_ids: [2] }]);
});

test("dollarsToCents", () => {
  assert.equal(dollarsToCents("45"), 4500);
  assert.equal(dollarsToCents("45.50"), 4550);
  assert.equal(dollarsToCents(""), 0);
  assert.equal(dollarsToCents("$1,200.05"), 120005);
  assert.equal(dollarsToCents("-3"), 0);
});

test("priceLabel", () => {
  assert.equal(priceLabel(4500), "$45");
  assert.equal(priceLabel(4550), "$45.50");
  assert.equal(priceLabel(0), "No price");
});

test("programSessionCount skips rest days", () => {
  assert.equal(programSessionCount([{ workout_id: 3 }, { workout_id: null }, { workout_id: 4 }, {}]), 2);
  assert.equal(programSessionCount([]), 0);
});

test("moveItem swaps within range only", () => {
  assert.deepEqual(moveItem(["a", "b", "c"], 1, -1), ["b", "a", "c"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 2, 1), ["a", "b", "c"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 0, 1), ["b", "a", "c"]);
});

test("ageLabel and inboxBadge and countOf", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  assert.equal(ageLabel("2026-10-21T11:59:30Z", now), "now");
  assert.equal(ageLabel("2026-10-21T11:55:00Z", now), "5m");
  assert.equal(ageLabel("2026-10-21T09:00:00Z", now), "3h");
  assert.equal(ageLabel("2026-10-19T12:00:00Z", now), "2d");
  assert.equal(inboxBadge([{ unread: 2 }, { unread: 0 }, { unread: true }], [{}, {}]), 5);
  assert.equal(inboxBadge(null, null), 0);
  assert.equal(countOf([1, 2]), 2);
  assert.equal(countOf(3), 3);
  assert.equal(countOf(undefined), 0);
});
