# Ask 21 — 40 Day Fitness: clickable, workable program

## Objective
The free "40 Day Fitness" row on the Coach tab opens a program sheet: 40 days laid out day-by-day (5 sessions/week + 2 rest days), each training day expandable to its exercise list, each exercise tappable through to the existing exercise detail sheet (video, cues, history). Locked programs stay exactly as they are.

## Data (src/Forge.jsx, module level, near PROGRAMS)

Five session templates drawing only names that exist in EX_LIB:
```js
const P40_TEMPLATES = [
  { name: "Foundation Push", focus: "Chest · Shoulders · Triceps", exs: [
    ["Barbell Bench Press", "4 × 6–8"], ["Incline DB Press", "3 × 10"], ["Seated DB Shoulder Press", "3 × 8–10"],
    ["DB Lateral Raise", "3 × 12–15"], ["Triceps Pushdown", "3 × 12"], ["Push-Up Finisher", "1 × AMRAP"]] },
  { name: "Foundation Pull", focus: "Back · Biceps", exs: [
    ["Deadlift", "4 × 5"], ["Lat Pulldown", "3 × 10"], ["Barbell Row", "3 × 8"],
    ["Face Pull", "3 × 15"], ["Hammer Curl", "3 × 12"]] },
  { name: "Foundation Legs", focus: "Quads · Glutes · Hamstrings", exs: [
    ["Back Squat", "4 × 6–8"], ["Romanian Deadlift", "3 × 8–10"], ["Walking Lunge", "3 × 12"],
    ["Leg Extension", "3 × 12–15"], ["Standing Calf Raise", "4 × 15"]] },
  { name: "Full Body Strength", focus: "Total body", exs: [
    ["Front Squat", "4 × 6"], ["Overhead Press", "4 × 6–8"], ["Chest-Supported Row", "3 × 10"],
    ["Barbell Hip Thrust", "3 × 8–10"], ["Plank Hold", "3 × 45s"]] },
  { name: "Engine & Core", focus: "Conditioning · Core", exs: [
    ["Kettlebell Swing", "5 × 15"], ["Goblet Squat", "3 × 12"], ["Farmer's Carry", "4 × 40yd"],
    ["Cable Crunch", "3 × 15"], ["Rowing Sprint", "6 × 250m"]] },
];
const PROGRAM_40 = Array.from({ length: 40 }, (_, i) => {
  const day = i + 1, wd = i % 7;               // wd 3 and 6 are rest days → 5 sessions/week
  if (wd === 3 || wd === 6) return { day, rest: true };
  const workoutIndex = i - Math.floor(i / 7) * 2 - (wd > 3 ? 1 : 0); // count of workout days before this one
  return { day, ...P40_TEMPLATES[workoutIndex % 5] };
});
```
Sanity: PROGRAM_40 has 40 entries, 29 workouts + 11 rest days, templates rotate A→E in order across workout days. Verify the workoutIndex math with a node check in the green-light (adjust the formula if needed — the requirement is: nth workout day overall gets template n % 5).

## UI

### 1. Make the free row clickable
The "40 Day Fitness" row (already `role="button"`): onClick → `setProgram40Open(true)`. Add a chevron (lucide `ChevronRight`, 16, C.muted) under the "Included" pill so it reads as tappable. New state `const [program40Open, setProgram40Open] = useState(false);` and `const [p40Day, setP40Day] = useState(null);` (expanded day number or null).

### 2. Program sheet
Rendered with the existing `Sheet` component (same pattern as the other sheets, place near them): `{program40Open && (<Sheet title="40 Day Fitness" onClose={() => { setProgram40Open(false); setP40Day(null); }}> ... </Sheet>)}`.
Content:
- Muted intro line: "40 days · 5 sessions a week · Coach Kyle" (C.muted, 12.5), then a small progress-free day list.
- Group by week: for weeks 1–6, a `<Label>Week N</Label>` then a `<Card style={{padding:0}}>` of that week's day rows (final week has 5 days).
- Day row (borderBottom between): left — "DAY {n}" (ff-d, 13, 700, letterSpacing .06em, C.energy for workout days / C.muted for rest), then session name (C.text, 14, 600) + focus (C.muted, 11.5) — rest days instead show "Rest" (C.muted, 14) and "Recover. Walk, stretch, sleep." (C.muted, 11.5). Right — chevron that rotates when expanded (workout days only).
- Tapping a workout day row toggles `p40Day` (accordion: only one open). When open, render the exercise list inside the same card cell below the row header: each exercise row = 44×26 rounded video thumbnail (`https://i.ytimg.com/vi/${VIDEO_IDS[name]}/mqdefault.jpg`, objectFit cover), name (C.text, 13.5, 600), sets×reps target (C.muted, 11.5) right-aligned; `role="button"`, onClick → `openExercise(name)` (the exact same handler the library rows use — the exercise sheet must open with video/cues/history working ON TOP of the program sheet; check the sheet render order allows this, exDetail renders after in the file so it stacks above).
- Rest day rows are not tappable.

## Hard rules
- Locked program rows: untouched. No speechSynthesis. No new localStorage keys. Minimal diff. Every exercise name used must exist in EX_LIB (green-light checks it).

## Green-light
```
cd ~/Projects/forge && npm run build
grep -c "PROGRAM_40" src/Forge.jsx      # >= 2
grep -c "P40_TEMPLATES" src/Forge.jsx   # 2
grep -c "program40Open" src/Forge.jsx   # >= 3
```
Plus a node script over the source: extract P40_TEMPLATES exercise names and assert each appears as a `name:` in EX_LIB; simulate the PROGRAM_40 generation and assert: 40 entries, exactly 29 workouts, rest exactly on wd 3/6, and the sequence of workout-day templates is A,B,C,D,E,A,B,... Report each check PASS/FAIL with actual output.
