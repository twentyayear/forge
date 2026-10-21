// src/data/exercises.test.js — the exercise library and the program catalog agree.
// EVERY exercise_key IN server/data/programs.js MUST BE AN EX_LIB NAME: THE CLIENT RESOLVES THE FORM VIDEO,
// CUES AND BLURB BY THAT EXACT STRING, SO A TYPO HERE IS A SESSION WITH NO VIDEO.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EX_LIB, EX_INFO } from "./exercises.js";
import { WORKOUTS, PROGRAMS } from "../../server/data/programs.js";

test("the library holds sixty unique exercises, each with an eleven-character video id and cues", () => {
  assert.equal(EX_LIB.length, 60);
  assert.equal(new Set(EX_LIB.map((e) => e.name)).size, 60);
  assert.equal(new Set(EX_LIB.map((e) => e.video)).size, 60, "video ids are unique");
  for (const e of EX_LIB) {
    assert.match(e.video, /^[A-Za-z0-9_-]{11}$/, `${e.name}: video id`);
    assert.ok(Array.isArray(e.cues) && e.cues.length === 3, `${e.name}: three cues`);
    assert.ok(e.blurb && e.equipment && e.muscles, `${e.name}: blurb, equipment, muscles`);
  }
});

test("every exercise in the six programs exists in the library, and every library exercise is used at least once", () => {
  const used = new Set();
  for (const [title, w] of Object.entries(WORKOUTS)) {
    for (const b of w.blocks) {
      assert.ok(EX_INFO[b.exercise_key], `${title}: "${b.exercise_key}" is not in EX_LIB`);
      used.add(b.exercise_key);
    }
  }
  const unused = EX_LIB.map((e) => e.name).filter((n) => !used.has(n));
  assert.deepEqual(unused, [], "unused library exercises");
  assert.equal(PROGRAMS.length, 6);
});
