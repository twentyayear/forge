# Ask 12 — History export (CSV), spoken acronym expansion, bigger ticker

## Context
Repo: `/Users/sm-pro/Projects/forge`, file `src/Forge.jsx`. Module data: `SCHEDULE` (iso date →
entries; done entries have `name`, `minutes`, `readiness`, `intensity`, `blocks:[{letter, name,
sets:[{reps, w}]}]`), `TODAY`, `iso()`, `workout` (today's session; `workout.exercises[i].name`),
state `log` = `[{i, w, reps}]`, `doneToday`, `summary`, `rpe`. `speak(text)` sets the coach text
line then fetches `/api/tts` with the text and plays it; `ttsCache` keys on `vid + "|" + text`.
Progress tab ends with a "Milestones" Card. Only edit `src/Forge.jsx`; no servers; voice call
sites unchanged (unit B modifies only the INSIDE of `speak`).

## Unit A — Export workout history (CSV)
1. Module helper `buildHistoryCsv(todayLog, todayDone)`:
   - Header row: `date,session,block,exercise,set,reps,weight_lb,volume_lb`
   - For every `SCHEDULE` entry with `status === "done"`, dates ascending: one row per set per
     block — `date` (iso), `session` (entry name), `block` (letter), `exercise` (block name),
     `set` (1-based), `reps`, `weight_lb` (0 for bodyweight), `volume_lb` (reps×w).
   - If `todayDone` and `todayLog.length`: append today's rows — date `iso(TODAY)`, session
     `workout.name`, block `"ABCDEF"[l.i]`, exercise `workout.exercises[l.i].name`, set = running
     count per exercise, reps/weight/volume from the log entry.
   - Quote any field containing a comma or quote (CSV-escape); join with `\n`.
2. In the Progress tab, after the Milestones Card: a full-width button (existing `btnG` style,
   marginTop 12, centered flex gap 8) — `Download` icon 16 (import from lucide-react) +
   `Export history (CSV)`. onClick: build the csv with current `log`/`doneToday`, then
   `const blob = new Blob([csv], { type: "text/csv" }); const a = document.createElement("a");
   a.href = URL.createObjectURL(blob); a.download = \`forge-history-${iso(TODAY)}.csv\`;
   a.click(); URL.revokeObjectURL(a.href);`
   Under the button, muted 11px centered line: `Every logged set · CSV opens in any spreadsheet`.

## Unit B — Spoken acronym expansion (display text unchanged)
Module level:
```js
const SPOKEN_WORDS = [
  [/\bDB\b/g, "dumbbell"],
  [/\bEZ-?Bar\b/gi, "easy bar"],
  [/\bRDL\b/g, "Romanian deadlift"],
  [/\bAMRAP\b/gi, "as many reps as possible"],
  [/\bBW\b/g, "bodyweight"],
  [/\b1RM\b/g, "one rep max"],
  [/\bHRV\b/g, "heart rate variability"],
];
const speechify = (t) => SPOKEN_WORDS.reduce((s, [re, w]) => s.replace(re, w), t);
```
Inside `speak` ONLY: after `setLine(text)` compute `const spoken = speechify(text);` and use
`spoken` (not `text`) for BOTH the cache key and the fetch body. On-screen text stays verbatim
(header/chips still say DB). No call sites change.

## Unit C — Bigger ticker
The live session ticker in the active-workout header (`{totalReps} REPS · {totalLb} LB`): numbers
go from 21px to 34px (keep `ff-d`, weight 800); the `REPS`/`LB` labels from 10px to 11.5px; keep
the layout otherwise (adjust spacing minimally if the larger size needs it, e.g. gap/baseline).

## Green-light
```bash
npm run build                                # exit 0
grep -c "buildHistoryCsv" src/Forge.jsx      # ≥ 2
grep -c "speechify" src/Forge.jsx            # ≥ 2
grep -c "Export history" src/Forge.jsx       # 1
node - <<'JS'
// speechify unit test against the real map
const SPOKEN_WORDS = [[/\bDB\b/g,"dumbbell"],[/\bEZ-?Bar\b/gi,"easy bar"],[/\bRDL\b/g,"Romanian deadlift"],[/\bAMRAP\b/gi,"as many reps as possible"],[/\bBW\b/g,"bodyweight"],[/\b1RM\b/g,"one rep max"],[/\bHRV\b/g,"heart rate variability"]];
const speechify = (t) => SPOKEN_WORDS.reduce((s,[re,w])=>s.replace(re,w),t);
const a = speechify("Next up: Seated DB Shoulder Press.");
const b = speechify("EZ-Bar Curl, AMRAP finisher.");
console.log(a); console.log(b);
if (!a.includes("dumbbell") || a.includes("DB")) process.exit(1);
if (!b.includes("easy bar") || !b.includes("as many reps as possible")) process.exit(1);
console.log("SPEECHIFY OK");
JS
```
