# Ask 02 — TrainHeroic-style session logs & richer schedule data

## Context
Repo: `/Users/sm-pro/Projects/forge`, single-component prototype `src/Forge.jsx`. Design tokens
in const `C`; display font class `ff-d`, body `ff-b`. Ask 01 (calendar strip + per-day views) is
done: module-level `TODAY`, `iso()`, `SCHEDULE` (map iso-date → entry), `sessionCycle`,
`buildSchedule()`, `CalendarStrip`, and a `selDay`-driven Today tab with 4 branches
(today / past-done / future-planned / rest). Do NOT start/stop any server. Only edit `src/Forge.jsx`.
The voice code (`speak`, `speechSynthesis`, `cheers`, `talking`) must remain byte-identical.

## The unit — emulate TrainHeroic's per-session activity log

### 1. Richer schedule data (module level)
- Give each `sessionCycle` entry an `exs` array of exercise names (with a base weight each), e.g.
  `exs: [{ n: "Barbell Bench Press", base: 185 }, ...]`. Push Day A's `exs` MUST be the 6 names
  from the existing `workout.exercises` (same order, base = parsed load; bodyweight finisher base 0).
  Invent sensible 4–5 exercise lists for Pull Day A, Leg Day, Upper B, Conditioning.
- In `buildSchedule()`, for `status: "done"` entries replace the flat `sets`/`volume` mocks with:
  - `blocks`: one per exercise: `{ letter: "ABCDEF"[j], name, sets: [{ reps, w }, ...] }` —
    3–4 sets each, deterministic from `(i, j, set index)` (NO Math.random): reps in 5–12,
    weight = base ± small deterministic progression (multiples of 5; bodyweight stays 0).
  - `readiness`: deterministic 62–91.
  - `intensity`: deterministic 5–9.
  - `sets` = total set count across blocks; `volume` = Σ reps×w. Keep `minutes` as-is.

### 2. Past-done day view (replace the Ask-01 version's card body)
Emulating the gif's "My Activity" card:
- Icon stat row (5 equal-width cells, like the existing `MiniStat` row but with a 15px lucide icon
  above the number, icon color `C.muted`, number `ff-d` 20px, label 9px muted uppercase):
  `Check` → `{blocks.length}/{blocks.length}` "Blocks" · `Activity` → readiness "Readiness" ·
  `Timer` → minutes "Minutes" · `Gauge` → `{intensity}/10` "Intensity" · `Dumbbell` →
  volume.toLocaleString() "LB". Import `Gauge` (and anything else missing) from lucide-react.
- Below, inside the same Card: the lettered exercise log. Each block row: a 26px circular badge
  (border `1px solid C.lineStrong`, bg `C.surface2`, letter in `C.energy`, 12px 700) + exercise
  name (13.5px, `C.text`, 600) + underneath a muted 12px line:
  `{reps list joined ", "} @ {weights list joined ", "} lb` (bodyweight → `{reps} reps · bodyweight`).
- Under the card: a borderless link-style button `Comment on Session` (13px, 600, color
  `C.recovery`, background none) that calls `setTab("coach")`.
- Keep the `Logged · synced to Coach Mike` line and Completed pill.

### 3. Today's planned session (isToday, before workout)
Emulating the screenshot's Coach Instructions + Warm-Up blocks — add BELOW the existing session
card (do not modify the card itself):
- Label `Coach instructions`, then Card: 13.5px `C.body` text:
  `Total-body tightness today — leave one rep in reserve on every top set, and film your last bench set.`
- Label `Warm-up`, then Card: a lettered badge `A` (same badge style as §2) + text 13.5px `C.body`:
  `3 min easy row or jacks, then 2 rounds: 10 leg swings each side, 10 band pull-aparts, 5 slow push-ups.`

### 4. Post-workout RPE (intensity rating)
- New state in `Forge()`: `const [rpe, setRpe] = useState(null);` Reset to `null` inside `start()`
  (add one line there — this is the ONLY allowed change inside `start`, do not touch its `speak` call).
- On the post-workout summary screen (`tab === "train" && !active && summary`): below the existing
  stats, add label `How hard was it?` + the existing `Stepper` component:
  `<Stepper label="Intensity" value={rpe ?? 7} unit="/10" step={1} min={1} onChange={(v)=>setRpe(Math.min(10,v))} />`
  (wrap in a div with maxWidth ~200 margin auto so it doesn't stretch full-width).
- In today's session card completed state (`doneToday && summary` MiniStat row), append
  `<MiniStat n={rpe ?? "–"} t="RPE" />`.

## Guardrails
No new dependencies or files. Match existing inline-style idiom. Don't rename existing things.
Don't touch: login, nav, Train active-workout flow, Progress, Coach, Devices, CalendarStrip.

## Green-light (run all, report real output)
```bash
npm run build   # exit 0
grep -c "Comment on Session" src/Forge.jsx   # ≥ 1
grep -c "Gauge" src/Forge.jsx                # ≥ 2 (import + usage)
grep -c "speechSynthesis" src/Forge.jsx      # exactly 3 (unchanged)
```
