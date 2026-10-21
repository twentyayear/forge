# Ask 36 — U10: Server-mode data honesty

## Objective
In server mode (alphaecho.io) the athlete app still shows numbers made up from the prototype's mock data:
- the **PR** and **Max** chips on the active-workout screen;
- the exercise-detail sheet's "Personal record", working-max default and "Estimated 1-rep max" chart;
- the Readiness sheet's **Long-term average** (and the coach line and voice line built from it);
- the Progress tab's **Export history (CSV)**.

Also, server mode has no way to change the fitness **device** after sign-in.

This unit makes every one of those read the athlete's real server data in server mode. **Prototype mode (Netlify, no flag) must stay exactly as it is now.**

Read `CLAUDE.md` first; its hard rules apply.

## Measured facts (don't re-derive)
- `src/Workhart.jsx` is 3709 lines, one component (`export default function Workhart()` at line 746). `SERVER_MODE` const at line 47.
- **Mock sources (module level, leave them as they are):**
  - `exHistory(name)` (line 256) → `{ pr:{label,date}, baseMax, series:[{wk,lb}×8] }`, derived from a hash of the name.
  - `SCHEDULE` (line 372).
  - `buildHistoryCsv(todayLog, todayDone)` (line 379), which reads `SCHEDULE`. Header row: `date,session,block,exercise,set,reps,weight_lb,volume_lb`.
  - `longAvg` (line 439), an IIFE over `SCHEDULE`.
- **Server-mode use sites that still read the mocks:**
  - Active-workout chips: line 2815 (`exHistory(ex.name).pr.label`), line 2819 (`maxes[ex.name] ?? exHistory(ex.name).baseMax`). The "Last" chip (line 2779) is already `SERVER_MODE ? null : lastFor(...)`; leave it.
  - Exercise-detail sheet (`exTab === "history"`): lines 3576, 3577, 3582, 3589.
  - `longAvg`: line 1353 (speak line in `openReadiness`), and lines 3433, 3439, 3461 (Readiness sheet).
  - CSV button: line 3169, `buildHistoryCsv(log, doneToday)`.
- Other `SCHEDULE` reads (lines 381, 383, 406, 433, 440, 558, 2498) are inside prototype-only code or functions. **Leave them.** There are 9 `SCHEDULE` occurrences today and there must still be 9 afterward.
- **Bootstrap** (`GET /api/bootstrap`, `server/data.js`) already returns `workoutLogs: [{ id, performed_at, notes, assignment_id, sets:[{ exercise_key, set_no, reps, weight_lbs, rpe }] }]`, ordered by `performed_at` asc. **`weight_lbs` is Postgres `numeric`, so it arrives as a STRING (e.g. `"135"`) or `null`.** Always use `Number(s.weight_lbs) || 0`.
  - `hydrateFromBootstrap` (line 934) does NOT store `workoutLogs` today. Add `serverLogs` state (default `[]`) and set it there.
  - `finish()` already calls `refetchBootstrap()` after a successful POST, so `serverLogs` refreshes after every workout.
  - Each bootstrap assignment has `workout: { id, title, notes, blocks }` (see `activeWorkoutFromAssignment(todayAssignment.workout)`, line 772). Only assignments from the last 7 days are included.
- `exercise_key` in logged sets equals the EX_LIB exercise **name** (`finish()`, line 1570, maps `exercise_key: ex.name`). So match history by `exercise_key === name`.
- `serverCheckins` state (line 755) is `{ "<iso>": {score, answers} }`.
- **Device:** the picker exists only on the prototype login screen (lines 1723–1748, `<select aria-label="Fitness device">` with 8 options). `device` state is at line 817. `PATCH /api/profile` already whitelists `device` (`server/data.js` line 11) and returns the merged profile. The pattern to copy is `changeBodyweight` (line 1454): API first, 401 → `goSignedOut()`, `!ok` → `setWriteError(...)`, else set state from the response.
- The Settings sheet is at lines 3643–3667. It already has `{!SERVER_MODE && …}` / `{SERVER_MODE && …}` forks.
- Root `package.json` is `"type": "module"`. There is no frontend test runner and none may be added; `node --test` (Node 22 built-in) runs plain `.js` files with no install.

## 1. New pure module `src/history.js` (no React, no DOM, no imports from `Workhart.jsx`)
Export:
- `realHistory(name, logs)` → `null` if no set in `logs` has `exercise_key === name`. Otherwise `{ pr, baseMax, series }`:
  - Weight per set: `w = Number(weight_lbs) || 0`.
  - **Bodyweight exercise** (every matching set has `w === 0`): `pr = { label: "<maxReps> reps", date }`, `baseMax = null`, `series = []`.
  - **Weighted exercise**: the PR set is the heaviest `w`; on a tie, the most reps; on a further tie, the earliest. `pr = { label: "<w> lb × <reps>", date }`. `baseMax` = the highest Epley estimate `w * (1 + reps/30)` over weighted sets, rounded to the nearest 5. `series` = one point per log containing the exercise, in `performed_at` order, taking that log's best Epley estimate rounded to 5, as `{ wk: "M/D", lb }`, keeping only the **last 8**.
  - `date` = the PR set's log `performed_at`, formatted with `toLocaleDateString("en-US", { month: "short", day: "numeric" })` (e.g. "Sep 4").
- `averageScore(checkinMap)` → the rounded mean of every `.score`, or `null` if the map is empty.
- `buildServerHistoryCsv(logs, assignments)` → a CSV string with the **same header row** as `buildHistoryCsv`. One row per set, logs in `performed_at` order, sets in `set_no` order. Columns:
  - `date`: local `YYYY-MM-DD` of `performed_at`.
  - `session`: the matching assignment's `workout.title` (`assignment_id === a.id`), otherwise `"Workout"`.
  - `block`: `"ABCDEFGHIJ"[i]`, where `i` is the order in which that `exercise_key` first appears within this log.
  - `exercise`: `exercise_key`.
  - `set`: `set_no`.
  - `reps`.
  - `weight_lb`: `Number(weight_lbs) || 0`.
  - `volume_lb`: `reps × weight_lb`.
  Use the same quoting rule as `csvField` (line 375). Copy that 4-line helper into `history.js`; don't import from the JSX.

## 2. `src/Workhart.jsx` wiring (server mode only; prototype paths byte-identical)
- Add `serverLogs` state, set in `hydrateFromBootstrap` from `data.workoutLogs || []`.
- Add one in-component helper: `const histFor = (name) => SERVER_MODE ? realHistory(name, serverLogs) : exHistory(name);`. Route all 6 `exHistory(...)` use sites through it. In server mode `histFor` can return `null`, so:
  - **PR chip**: render only when `histFor(name)` is non-null.
  - **Max chip**: value `maxes[name] ?? hist?.baseMax`. Render only when that value is non-null (and the existing `!bw` condition still holds).
  - **Detail sheet**:
    - When `hist` is null, the PR card shows `No logged sets yet` in place of the label and date.
    - The chart block (its `Label` + chart) renders only when `hist?.series.length >= 2`.
    - The Stepper stays, with value `maxes[exDetail] ?? hist?.baseMax ?? 0`.
- Add `const baselineAvg = SERVER_MODE ? (averageScore(serverCheckins) ?? readyToday) : longAvg;` (useMemo is fine). Replace the 4 `longAvg` use sites with it.
- CSV button: `SERVER_MODE ? buildServerHistoryCsv(serverLogs, serverAssignments) : buildHistoryCsv(log, doneToday)`. Keep the same filename and download code.
- **Device in Settings (server mode only)**: move the 8 `<option>` values into one module-level `DEVICE_OPTIONS` array and render the login `<select>` from it. The login screen output must stay identical. Under `{SERVER_MODE && …}` in the Settings sheet, above Sign out, add `<Label>Fitness device</Label>` and a `<select aria-label="Fitness device">` built from `DEVICE_OPTIONS`, with the same `inp` style. Wire it to a new `changeDevice(v)` that copies the `changeBodyweight` pattern: `PATCH /api/profile {device}`, then `setDevice(profile.device)`, with error text `"Couldn't save device — try again."`. **No localStorage write in server mode.**

## Tests — new `src/history.test.js` (`node:test` + `node:assert/strict`, imports `./history.js`)
1. `realHistory` returns `null` for an exercise with no sets.
2. Weighted PR picks the heaviest set, breaks ties by most reps, and accepts **string** `weight_lbs` (`"135"`). The label is exactly `"135 lb × 5"` for a log of 135×5 and 135×3.
3. Bodyweight: all-null weights → `"<maxReps> reps"`, `baseMax === null`, `series` empty.
4. `baseMax` = rounded Epley estimate (e.g. 200×5 → 233.3 → 235). `series` keeps only the last 8 logs, in order.
5. `averageScore({})` is `null`; `{a:{score:70},b:{score:81}}` → `76`.
6. `buildServerHistoryCsv`:
   - the header row equals the prototype header exactly;
   - there is one row per set;
   - the assignment title is used when `assignment_id` matches, `"Workout"` otherwise;
   - block letters follow first-appearance order;
   - a title containing a comma is quoted.

## Hard rules
- Files you may change or create: **only** `src/Workhart.jsx`, `src/history.js` (new), `src/history.test.js` (new). No `server/` changes, no `netlify/` changes, no new dependencies, no build-config changes.
- Prototype mode must behave exactly as before:
  - `exHistory`, `SCHEDULE`, `buildHistoryCsv`, `longAvg` and `lastFor` must be unchanged (none of their lines edited);
  - prototype chips, sheet, CSV and Readiness numbers must come out identical.
- No `window.speechSynthesis`. Don't touch the voice recipe or `speak()`.
- Don't touch the Kyle console (`screen === "console"`), messaging or fuel code.
- No commits, no deploy, no ssh.

## Green-light
Run every line from the repo root.
```
npm run build                                                                 # PASS: exit 0
VITE_SERVER_MODE=1 npm run build                                              # PASS: exit 0
node --test src/history.test.js                                               # PASS: 6 tests, fail 0
grep -c "SCHEDULE" src/Workhart.jsx                                           # PASS: 9 (unchanged)
grep -c "exHistory(" src/Workhart.jsx                                         # PASS: 2 (definition + inside histFor)
grep -c "longAvg" src/Workhart.jsx                                            # PASS: 2 (definition + inside baselineAvg)
grep -c "buildHistoryCsv(" src/Workhart.jsx                                   # PASS: 2 (definition + the guarded call)
grep -c "speechSynthesis" src/Workhart.jsx src/history.js                     # PASS: 0 for both
git status --porcelain -- src server netlify                                  # PASS: exactly "RM src/Forge.jsx -> src/Workhart.jsx", " M src/main.jsx", " M server/package.json", "?? server/test/idor.test.js", "?? src/history.js", "?? src/history.test.js"
./ops/deploy.sh                                                               # LIVE — PASS: deploy OK
# LIVE, in browser on alphaecho.io as the test athlete hey+gl@ (mint-link), never Sam's account:
#  a. Train → start today's assigned workout → on an exercise GL has logged before (Barbell Bench Press): the PR chip equals realHistory computed from psql's workout_log_sets for GL
#  b. Progress → Export history (CSV): data-row count == psql `SELECT count(*) FROM workout_log_sets WHERE user_id=<GL>`
#  c. Settings → Fitness device → pick "Garmin": psql `SELECT profile->>'device' FROM users WHERE email LIKE 'hey+gl@%'` == Garmin; reload shows Garmin
#  d. Readiness sheet Long-term average == psql round(avg(score)) over GL's checkins
curl -s https://alphaecho.io/api/health                                       # LIVE — PASS: ok true, db true
```
The chief of staff checks the prototype regression (dev server, no flag) in the browser. Builders don't need to.

Report every line PASS/FAIL with actual output, then stop.
