# Ask 11 — P2P-style set grid (replaces the one-set stepper loop) + collapsible workout video

## Context
Repo: `/Users/sm-pro/Projects/forge`, file `src/Forge.jsx`. Active-workout screen currently: orb →
coach line → rest timer → Weight/Reps `Stepper` pair fed by `entry` state → `Log set N` button
(`logSet`) → Form cue / End workout → 16:9 video embed. `log` = `[{i,w,reps}]` feeds
`finish(log)`, the ticker (ask 10), and the summary. `VIDEO_IDS` map exists. Only edit
`src/Forge.jsx`. Voice: the existing `speak` lines (cheers on set, transition line, finish line)
must keep firing at the same moments; no new lines.

## The unit
### 1. Grid state (replaces `entry`)
- DELETE `entry`/`setEntry` state and the prefill `useEffect` that sets it from `active?.i`.
- ADD `const [grid, setGrid] = useState({});` — `{ [exIndex]: [{reps, w, done}] }`. New
  `useEffect` on `active?.i`: if `active` and `grid[active.i]` is undefined, initialize it to
  `ex.sets` rows of `{ reps: parseReps(ex.reps), w: parseWeight(ex.load) ?? 0, done: false }`.
  Reset `setGrid({})` inside `start()` (alongside the existing resets; do not touch its `speak`).

### 2. Set-grid card (replaces the two `Stepper`s AND the `Log set` button AND the logged-set chips row)
A `Card` (textAlign left, marginTop 16, padding "12px 14px"):
- Header row: 9.5px muted uppercase spaced labels — `Set` (28px col), `Reps` (flex 1 center),
  `Lb` (flex 1 center), empty 44px col.
- One row per `grid[active.i]` entry (flex, gap 8, alignItems center, marginTop 8):
  - Set number: 13px 700 `C.muted`, width 28.
  - Reps: `<input type="number" inputMode="numeric">` centered, bg `C.surface2`, border 1px
    `C.line`, borderRadius 11, minHeight 44, `ff-d` 18px 700 `C.text`, width 100%; flex-1 wrapper.
    Editing updates the row (clamp ≥ 1). Disabled (opacity .55) once the row is `done`.
  - Lb: same input; for bodyweight exercises (`parseWeight(ex.load) === null`) render a static
    `BW` cell (same box, `C.body` text) instead of an input.
  - Check button, 44×44, borderRadius 12, flexShrink 0, `aria-label={`Log set ${row index + 1}`}`:
    not done → border 1px `C.lineStrong`, bg none, `Check` icon 18 `C.muted`;
    done → bg `C.recovery`, no border, `Check` icon 18 color `C.bg`.
- Under the rows, centered flex (gap 14, marginTop 12): minus button · label `Set` (11px muted
  600 uppercase) · plus button. Both 36×36 circles, border 1px `C.lineStrong`, bg none, icons
  `Minus`/`Plus` 15 `C.body`. Minus removes the LAST row only if it exists, is not `done`, and
  more than 1 row remains. Plus appends a copy of the last row's `{reps, w}` with `done: false`.

### 3. Check behavior (replaces `logSet` — delete the old function)
Checking an undone row `k`:
- mark it done; append `{ i: active.i, w: bodyweight ? 0 : row.w, reps: row.reps }` to `log`;
- `setRest(90)`;
- if that was the LAST undone row of this exercise: advance exactly as `logSet` did —
  next exercise: `setActive({ i: active.i + 1, done: 0 })` + the existing
  `speak(`Nice work. Next up: …`)` line; if it was the final exercise: `finish(newLog)`.
- otherwise `setActive({ ...active, done: n })` + the existing cheers rotation
  (`speak(cheers[idx.current++ % cheers.length])`).
Un-checking a done row (tap again, allowed only while its exercise is still active): mark undone,
remove the LAST matching `{i, w, reps}` entry from `log`, decrement `active.done`. No speak.
Keep `active.done` consistent with the number of done rows.
The orb (`{active.done}/{ex.sets}`) should show `{done rows}/{total rows}` of the current grid.

### 4. Video → collapsible thumbnail (active screen only; Instruction tab unchanged)
Replace the always-open 16:9 embed with:
- `const [videoOpen, setVideoOpen] = useState(false);` — also reset to false whenever `active?.i`
  changes (fold into the grid-init effect).
- Collapsed: a full-width `<button>` row (bg `C.surface`, border 1px `C.line`, borderRadius 14,
  padding 10, flex, gap 12, alignItems center, textAlign left, marginTop 14):
  `<img src={`https://i.ytimg.com/vi/${VIDEO_IDS[ex.name]}/mqdefault.jpg`} alt="" width 96
  style={{borderRadius: 9, display: "block"}} />` + column: 13px 600 `C.text` `Form video` /
  11px muted `Watch on YouTube · tap to expand` + `Play` icon 16 `C.energy` at the right.
- Expanded (`videoOpen`): the exact existing 16:9 wrapper+iframe+caption, plus the same button row
  above it acting as collapse (label switches to `tap to collapse`).
- No entry in `VIDEO_IDS` → nothing (as now).

## Guardrails
`finish`, summary/RPE screen, ticker/dots/chips (ask 10), orb visuals, coach line, rest timer,
Form cue / End workout buttons — untouched apart from what's specified. `Stepper` component stays
(used by RPE + working max). No new deps.

## Green-light
```bash
npm run build                            # exit 0
grep -c "const logSet" src/Forge.jsx     # 0
grep -c "setEntry" src/Forge.jsx         # 0
grep -c "mqdefault" src/Forge.jsx        # 1
grep -c "speak(cheers" src/Forge.jsx     # 1  (cheers preserved)
```
