import { test } from "node:test";
import assert from "node:assert/strict";
import { weekRange, trendPoints, needsYouLabel, clientSubline } from "./trainer.js";

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
