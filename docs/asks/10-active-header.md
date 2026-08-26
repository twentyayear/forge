# Ask 10 — Active-workout header: progress dots, live ticker, block eyebrow, history chips

## Context
Repo: `/Users/sm-pro/Projects/forge`, file `src/Forge.jsx`, active-workout block
(`tab === "train" && active`, computes `const ex = workout.exercises[active.i]`). Existing module
pieces: `SCHEDULE` (iso date → done entries with `blocks:[{letter,name,sets:[{reps,w}]}]`),
`iso()`, `TODAY`, `DAY_MS`, `exHistory(name)` → `{pr:{label,date}, baseMax}`, state `maxes`,
`openExercise(name)`, `log` = `[{i,w,reps}]`, tokens `C`. Only edit `src/Forge.jsx`; no servers;
no voice changes (existing `speak` calls untouched).

## The unit — all inside the active-workout screen
1. **Module helpers**
   - `const BLOCK_TYPES = ["Strength / Power", "Strength / Power", "Hypertrophy", "Hypertrophy", "Accessory", "Finisher"];`
   - `function lastFor(name)`: scan offsets 1..28 back from `TODAY`; first `SCHEDULE` entry with
     `status === "done"` containing a block whose `name` matches → return formatted string:
     bodyweight (`every set w === 0`) → `` `${sets.length}×${max reps} reps` ``, else
     `` `${sets.length}×${last set reps} @ ${max w} lb` ``. No match → `null`.
2. **Replace** the `Exercise {active.i + 1} of {workout.exercises.length}` line with:
   - A centered dot row (`display:flex, gap:6, justifyContent:center`): one dot per exercise.
     Done (`k < active.i`): 8px circle, `background: C.recovery`. Current: 22px×8px rounded pill,
     `background: C.energy`. Upcoming: 8px circle, `background: C.line`. Add
     `aria-label={`Exercise ${active.i + 1} of ${workout.exercises.length}`}` on the row.
   - Under it, the live session ticker (margin-top 10): `ff-d` 21px 800 —
     `{totalReps}` in `C.text` + ` REPS` 10px muted 600 uppercase spaced, ` · ` muted,
     `{totalLb.toLocaleString()}` + ` LB` same label style, where
     `totalReps = log.reduce((s,l)=>s+l.reps,0)` and `totalLb = log.reduce((s,l)=>s+(l.w||0)*l.reps,0)`.
3. **Eyebrow** directly above the `<h1>` exercise name: 10.5px, 700, uppercase,
   letterSpacing .14em, color `C.energy`, opacity .85:
   `{"ABCDEF"[active.i]} · {BLOCK_TYPES[active.i]}`
4. **History chip row** under the existing `Target … · …` line (margin-top 10, centered flex,
   gap 7, flexWrap wrap): chips are `<button>`s (background `C.surface`, border 1px `C.line`,
   borderRadius 999, padding "6px 11px", fontSize 11.5, fontWeight 600, color `C.body`) that call
   `openExercise(ex.name)`. Muted label + value:
   - `Last {lastFor(ex.name)}` — omit chip when null.
   - `PR {exHistory(ex.name).pr.label}`
   - `Max {maxes[ex.name] ?? exHistory(ex.name).baseMax} lb` — omit for bodyweight exercises
     (`parseWeight(ex.load) === null`).

## Guardrails
Orb, coach line, rest timer, steppers, Log set, Form cue/End workout, video — all untouched.

## Green-light
```bash
npm run build                          # exit 0
grep -c "BLOCK_TYPES" src/Forge.jsx    # ≥ 2
grep -c "lastFor" src/Forge.jsx        # ≥ 2
grep -c "Exercise 1 of\|Exercise {active" src/Forge.jsx | cat   # 0 (old counter line gone)
```
