# Ask 04 — Exercise detail sheet (TrainHeroic History / Instruction screen)

## Context
Repo: `/Users/sm-pro/Projects/forge`, file `src/Forge.jsx`. Asks 01–03 done: `Sheet` component
exists; `SCHEDULE` past entries have lettered `blocks`; Train tab (pre-workout, `tab === "train"
&& !active && !summary`) lists `workout.exercises` rows; recharts + lucide imported (`Award` is
already imported). Only edit `src/Forge.jsx`; no servers; voice code byte-identical (no new speak
calls this unit).

## The unit
### 1. Deterministic history data (module level)
`function exHistory(name)`: hash = sum of charCodes of `name`. Returns `{ pr: { label, date },
baseMax, series }` where `baseMax` = 95 + (hash % 40) * 5 (bodyweight-ish names containing
"Push-Up"/"Plank" → pr label uses reps instead of weight); `pr` = `{ label: \`${baseMax + 20} lb × 3\`,
date: "Aug 9" }` (reps variant: `"22 reps"`, date "Aug 14"); `series` = 8 weeks `{ wk: "W1"... ,
lb: baseMax * (0.82 + k*0.026) rounded to 5 }` with one deterministic dip at week `(hash % 5) + 2`
(multiply that week by 0.97) so the line looks human.

### 2. State in `Forge()`
`const [exDetail, setExDetail] = useState(null);` (exercise name or null),
`const [exTab, setExTab] = useState("history");`,
`const [maxes, setMaxes] = useState({});` (name → working max lb).
Opening an exercise: `setExDetail(name); setExTab("history");`.

### 3. The sheet (render alongside the readiness sheet)
`{exDetail && <Sheet title={exDetail} onClose={() => setExDetail(null)}>}` containing:
- Segmented tab toggle: two flex-1 buttons `History` / `Instruction` — active: `C.text` with a 2px
  bottom border in `C.energy`; inactive: `C.muted`, border transparent. 13px 600.
- **History tab:**
  - PR card (`C.surface2` rounded 15, padding 14): `Award` icon 18 `C.energy` + "Personal record"
    label (10px muted uppercase) + `ff-d` 24px `{pr.label}` + muted 11px `{pr.date}`.
  - Working-max card: label "Working max" + the existing `Stepper` with unit "lb", step 5,
    `value={maxes[exDetail] ?? exHistory(exDetail).baseMax}`,
    `onChange={(v) => setMaxes({ ...maxes, [exDetail]: v })}`.
  - "Estimated 1-rep max" label + `ResponsiveContainer` height 160 `LineChart` of
    `exHistory(exDetail).series`: `Line` stroke `C.energy` strokeWidth 2.5 dot=false, XAxis "wk"
    10px muted no lines, YAxis hidden domain ["dataMin - 10", "dataMax + 10"].
- **Instruction tab:**
  - If the name matches a `workout.exercises` entry: its `cues` as separate rows (each: 5px round
    `C.energy` dot + 13.5px `C.body` text, lineHeight 1.6) and, if it has `note`, the note in a
    `C.surface2` bubble 12.5px `C.energy`-tinted like the existing note style.
  - Else 3 generic cues: `Brace before every rep.` / `Control the negative — two seconds down.` /
    `Stop one rep before form breaks.`

### 4. Triggers (both)
a. Train-tab pre-workout exercise rows: make each row tappable (button semantics, full row,
   background none, textAlign left, keep the existing layout inside) → opens the sheet. Add a muted
   `ChevronDown` rotated -90° (or import `ChevronRight`) at the row's right edge as affordance.
b. Past-done day lettered block rows (Ask 02): same — each row opens the sheet for that block's name.

## Guardrails
No new deps/files. Don't restructure existing rows beyond wrapping for tap. Don't touch voice,
CalendarStrip, readiness sheet content, schedule data.

## Green-light (run all, report real output)
```bash
npm run build                                 # exit 0
grep -c "exHistory" src/Forge.jsx             # ≥ 4
grep -c "exDetail" src/Forge.jsx              # ≥ 5
grep -c "speechSynthesis" src/Forge.jsx       # exactly 5
```
