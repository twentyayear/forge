import { test } from "node:test";
import assert from "node:assert/strict";
import { dayTotals, proteinRange, fmtKcal, withinDay, normalizeFood, lastDays } from "./fuel.js";

const rows = [
  { id: 1, eaten_on: "2026-10-21T00:00:00.000Z", calories: 500, protein_g: 40, carbs_g: 50, fat_g: 10 },
  { id: 2, eaten_on: "2026-10-21T00:00:00.000Z", calories: 200, protein_g: null, carbs_g: null, fat_g: 5 },
  { id: 3, eaten_on: "2026-10-22T00:00:00.000Z", calories: 999, protein_g: 99, carbs_g: 99, fat_g: 99 },
];

test("dayTotals sums only the day's rows and treats nulls as 0", () => {
  assert.deepEqual(dayTotals(rows, "2026-10-21"), { kcal: 700, protein: 40, carbs: 50, fat: 15, count: 2 });
  assert.deepEqual(dayTotals(rows, "2026-10-20"), { kcal: 0, protein: 0, carbs: 0, fat: 0, count: 0 });
  assert.equal(dayTotals(undefined, "2026-10-21").count, 0);
});

test("proteinRange is 0.8 to 1.0 x bodyweight", () => {
  assert.deepEqual(proteinRange(180), [144, 180]);
  assert.equal(proteinRange(0), null);
  assert.equal(proteinRange(undefined), null);
});

test("withinDay compares the first ten characters across midnight", () => {
  assert.equal(withinDay("2026-10-21T23:59:59.999Z", "2026-10-21"), true);
  assert.equal(withinDay("2026-10-22T00:00:00.000Z", "2026-10-21"), false);
  assert.equal(withinDay("2026-10-22T00:00:00.000Z", "2026-10-22"), true);
  assert.equal(withinDay(null, "2026-10-22"), false);
});

test("fmtKcal rounds and groups thousands", () => {
  assert.equal(fmtKcal(2400), "2,400");
  assert.equal(fmtKcal(1234.6), "1,235");
  assert.equal(fmtKcal(null), "0");
});

test("normalizeFood accepts the route shape and the ask shape", () => {
  assert.deepEqual(normalizeFood({ name: "Oats", brand: "Q", kcal: 150.4, protein: 5, carbs: 27, fat: 3 }),
    { name: "Oats", brand: "Q", kcal: 150, protein: 5, carbs: 27, fat: 3, raw: null });
  assert.equal(normalizeFood({ name: "Egg", calories: 70, protein_g: 6, raw: { a: 1 } }).kcal, 70);
  assert.equal(normalizeFood({ calories: 1 }), null);
});

test("lastDays ends today and has seven distinct days across a DST change", () => {
  const d = lastDays("2026-11-02");
  assert.equal(d.length, 7);
  assert.equal(d[6].date, "2026-11-02");
  assert.equal(d[0].date, "2026-10-27");
  assert.equal(new Set(d.map((x) => x.date)).size, 7);
});
