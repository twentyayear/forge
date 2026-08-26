# Ask 01 — TrainHeroic-style calendar strip: Today-tab wiring

## Context
Repo: `/Users/sm-pro/Projects/forge`. Single-component React prototype in `src/Forge.jsx`
(inline styles, design tokens in const `C`, fonts via `ff-d`/`ff-b` classes). Vite dev server
may be running on port 4890 — do NOT start or kill any server.

**Already applied (do not re-add, do not modify):**
- Module-level calendar helpers after `parseReps`: `DAY_MS`, `startOfDay`, `pad2`, `iso()`,
  `fmtLong()`, `fmtMonth()`, `WD`, `TODAY`, `CAL_DAYS` (42 days: −28…+13), `sessionCycle`,
  `buildSchedule()`, `SCHEDULE` (map of iso-date → `{name, duration, focus, status:
  "done"|"planned", sets?, minutes?, volume?}`; rest days and 2 missed days are absent keys).
- `CalendarStrip({ selected, onSelect, doneToday })` component (defined after `Ring`).
- State inside `Forge()`: `const [selDay, setSelDay] = useState(iso(TODAY));`

## The unit
Rewire ONLY the `{tab === "today" && ( ... )}` JSX block in `Forge()` so the calendar strip
drives what the Today tab shows. Touch nothing else. The voice code (`speak`, `speechSynthesis`,
cheers, talking state) must remain byte-identical.

### Required behavior
Convert the block to `{tab === "today" && (() => { ... })()}` computing:
```js
const todayIso = iso(TODAY);
const isToday = selDay === todayIso;
const selDate = new Date(selDay + "T00:00:00");
const entry = SCHEDULE[selDay];
```

1. First element inside: `<CalendarStrip selected={selDay} onSelect={setSelDay} doneToday={doneToday} />`
2. Date line: replace hardcoded `Sunday, Aug 23` with `{fmtLong(selDate)}` (same styling).
3. `isToday === true`: render EXACTLY the existing content below the date line, unchanged —
   `Morning, Alex` h1, readiness-ring Card, "Today's session" Label + session Card
   (doneToday/summary/start-button logic intact), "This week" stats, "From Coach Mike" Card.
4. `!isToday && entry?.status === "done"` (past, completed):
   - h1 (same classes/styles as `Morning, Alex` h1): `{entry.name}` (it's already uppercase-styled).
   - Label: `Session log`
   - Card: focus/duration line (`{entry.duration} · {entry.focus}`, same muted style as today's
     card meta line), `<Pill tone="recovery">Completed</Pill>` top-right (same flex layout as
     today's session card header), then a MiniStat row (same as the doneToday row in today's
     card): `<MiniStat n={entry.sets} t="Sets" />`, `<MiniStat n={entry.volume.toLocaleString()}
     t="lb volume" />`, `<MiniStat n={entry.minutes} t="Minutes" />`.
   - Below stats inside the Card: muted 11.5px line `Logged · synced to Coach Mike`.
   - No start button. No readiness/week/coach sections.
5. `!isToday && entry?.status === "planned"` (future):
   - Same h1 pattern: `{entry.name}`.
   - Label: `Scheduled session`
   - Card: header row with meta line + `<Pill tone="energy">Scheduled</Pill>`, then muted
     11.5px line: `Unlocks on the day — Coach Mike may still adjust the plan.`
   - No start button.
6. `!isToday && !entry` (rest day):
   - h1: `Rest Day`.
   - Label: `Recovery`
   - Card: flex row, `<Moon size={22} color={C.recovery} />` + body-colored 13.5px text:
     `Nothing on the plan. Sleep, eat, walk — the readiness score tomorrow will thank you.`
   (`Moon` is already imported from lucide-react.)

### Guardrails
- No new dependencies, no new files, no changes outside the today-tab block.
- Match existing inline-style idiom exactly (copy style objects from neighboring JSX).
- Do not rename or restructure anything already in the file.

## Green-light (binary, run all)
```bash
npm run build
```
Build must exit 0. Then:
```bash
grep -c "Sunday, Aug 23" src/Forge.jsx   # must output 0
grep -c "CalendarStrip selected" src/Forge.jsx   # must output 1
```
Report the actual command output, pass or fail.
