# Ask 18 — Exercise Library (50 exercises)

## Objective
Build a browsable 50-exercise library in the Train tab: the 25 exercises already in the app plus 25 new popular gym exercises. Every exercise has a verified YouTube form video, an explanation blurb, 3 form cues, equipment tag, muscles, and a base working weight (so history/PR/Max sheets work). All video IDs below are pre-verified via YouTube oEmbed — use them EXACTLY as given, do not substitute.

## Data (src/Forge.jsx, module level)

Add `EX_LIB` — an array of 50 objects `{ name, equipment, muscles, base, video, blurb, cues }`:
- `equipment`: one of "Barbell" | "Dumbbell" | "Kettlebell" | "Cable" | "Machine" | "Bodyweight"
- `muscles`: short string like "Chest · Triceps"
- `blurb`: 1–2 sentence explanation in the coach's voice (plain, confident, no fluff)
- `cues`: exactly 3 short imperative form cues, same style as the existing `workout.exercises` cues (e.g. "Ribs down — don't flare at the bottom")

### Existing 25 — keep name/base/video EXACTLY (bases match sessionCycle; videos match current VIDEO_IDS):
| name | equipment | base | video |
|---|---|---|---|
| Barbell Bench Press | Barbell | 185 | 4Y2ZdHCOXok |
| Seated DB Shoulder Press | Dumbbell | 55 | vlFGTI5JzjI |
| Incline DB Press | Dumbbell | 60 | IP4oeKh1Sd4 |
| Cable Lateral Raise | Cable | 15 | Sp8be0IFNvk |
| Overhead Rope Extension | Cable | 42 | Fwl0T1_giQ0 |
| Push-Up Finisher | Bodyweight | 0 | I9fsqKE5XHo |
| Deadlift | Barbell | 225 | XxWcirHIwVo |
| Pull-Up | Bodyweight | 0 | eGo4IYlbE5g |
| Barbell Row | Barbell | 135 | FWJR5Ve8bnQ |
| Seated Cable Row | Cable | 120 | vwHG9Jfu4sw |
| Barbell Curl | Barbell | 65 | QZEqB6wUPxQ |
| Back Squat | Barbell | 205 | my0tLDaWyDU |
| Romanian Deadlift | Barbell | 155 | 5zmlnbWb-g4 |
| Walking Lunge | Dumbbell | 40 | Pbmj6xPo-Hw |
| Leg Press | Machine | 270 | FNTd_mxtWmo |
| Standing Calf Raise | Machine | 90 | k8ipHzKeAkQ |
| Push Press | Barbell | 115 | gFmV302JErc |
| Weighted Pull-Up | Bodyweight | 25 | Sj7k-tOFdsM |
| Close-Grip Bench Press | Barbell | 155 | UYJsFzqdgK4 |
| EZ-Bar Curl | Barbell | 60 | 5NsFLGUf0Fo |
| Triceps Pushdown | Cable | 55 | 8WL0m0vLAPo |
| Kettlebell Swing | Kettlebell | 53 | DqkYuWR4zRI |
| Rowing Sprint | Machine | 0 | mrexeRFo4UM |
| Sled Push | Machine | 180 | 9XRRXaUpnLk |
| Plank Hold | Bodyweight | 0 | 6LqqeBtFn9M |

For the 6 exercises that already have cues in the `workout` const (Barbell Bench Press, Seated DB Shoulder Press, Incline DB Press, Cable Lateral Raise, Overhead Rope Extension, Push-Up Finisher), copy those exact cues into EX_LIB. Author cues/blurbs for the other 19.

### New 25 — use these names/bases/videos EXACTLY:
| name | equipment | base | video |
|---|---|---|---|
| Dumbbell Bench Press | Dumbbell | 65 | YQ2s_Y7g5Qk |
| One-Arm DB Row | Dumbbell | 70 | pYcpY20QaE8 |
| Goblet Squat | Kettlebell | 60 | MxsFDhcyFyE |
| Barbell Hip Thrust | Barbell | 225 | EF7jXP17DPE |
| Lat Pulldown | Cable | 140 | qaJhYsCkX2s |
| Face Pull | Cable | 45 | UMGpxwhsy_k |
| Hammer Curl | Dumbbell | 35 | 8XLxfXROrTo |
| Bulgarian Split Squat | Dumbbell | 40 | HBYGeyb4sSM |
| Leg Extension | Machine | 110 | m0FOpMEgero |
| Lying Leg Curl | Machine | 90 | n5WDXD_mpVY |
| Front Squat | Barbell | 165 | G-Vamqoy8qM |
| Overhead Press | Barbell | 115 | _RlRDWO2jfg |
| Dips | Bodyweight | 0 | BRBVKxMb1RQ |
| Cable Chest Fly | Cable | 35 | HXVtFoExms0 |
| Incline Bench Press | Barbell | 155 | 5kyLUGVq_pk |
| Preacher Curl | Barbell | 55 | sxA__DoLsgo |
| Skull Crusher | Barbell | 60 | OQ4TWXkZjTc |
| DB Lateral Raise | Dumbbell | 20 | 3VcKaXpzqRo |
| Barbell Shrug | Barbell | 185 | KbsQ1E8Hg0o |
| Cable Crunch | Cable | 70 | AV5PmZJIrrw |
| Hanging Leg Raise | Bodyweight | 0 | Pr1ieGZ5atk |
| Farmer's Carry | Dumbbell | 90 | Fkzk_RqlYig |
| Box Jump | Bodyweight | 0 | Fk4KjYsLfSg |
| Arnold Press | Dumbbell | 45 | 6Z15_WdXmVw |
| Chest-Supported Row | Machine | 90 | 0UBRfiO4zDs |

## Rewiring
1. `VIDEO_IDS` becomes derived: `const VIDEO_IDS = Object.fromEntries(EX_LIB.map((e) => [e.name, e.video]));` — delete the hand-written map. All existing VIDEO_IDS usages keep working.
2. `EX_BASE` becomes derived from EX_LIB the same way (`[e.name, e.base]`). Keep the sessionCycle `base` fields as they are (they must stay equal to EX_LIB's — the green-light checks this).
3. Add `const EX_INFO = Object.fromEntries(EX_LIB.map((e) => [e.name, e]));`
4. Exercise detail sheet (`exDetail`, around line ~1700): the cues fallback currently uses `found ? found.cues : [generic...]`. Change resolution order to: `workout.exercises` match → `EX_INFO[exDetail]?.cues` → existing generic fallback. Also show the blurb: if `EX_INFO[exDetail]?.blurb`, render it above the cues list (C.body, 13, lineHeight 1.55). Show `muscles · equipment` as a muted line under the sheet's exercise title if available.

## Library UI (Train tab, idle state)
In the `tab === "train" && !active && !summary` branch, BELOW all existing content, add:
- `<Label>Exercise library</Label>` with a muted count line "50 exercises · tap for form video & history".
- A search input (styled like `inp`, placeholder "Search exercises…", state `libQ`).
- A horizontally scrollable chip row (display flex, gap 8, overflowX auto, no scrollbar — reuse existing patterns; chips: All, Barbell, Dumbbell, Kettlebell, Cable, Machine, Bodyweight; state `libEq`, default "All"; selected chip: border/energy tint like other selected pills).
- Filtered list: `EX_LIB.filter(name includes libQ case-insens && (libEq === "All" || equipment === libEq))`, sorted alphabetically, rendered in a `<Card style={{padding:0}}>` as rows (borderBottom between): 56×32 rounded video thumbnail `https://i.ytimg.com/vi/${e.video}/mqdefault.jpg` (objectFit cover), then name (C.text 14 600) with `muscles · equipment` under it (C.muted 11.5). Row `role="button"` tabIndex 0, onClick `{ setExDetail(e.name); setExTab("history"); }` (same as other exercise-open flows — check how existing chips open the sheet and match it).
- Empty state row "No exercises match." when filter yields nothing.

## Hard rules
- No speechSynthesis. No new localStorage keys. Video IDs verbatim from the tables. Don't touch sessionCycle, SCHEDULE, or the active-workout flow.

## Green-light
```
cd ~/Projects/forge && npm run build
node --input-type=module -e "
import { readFileSync } from 'fs';
const src = readFileSync('src/Forge.jsx','utf8');
const m = src.match(/const EX_LIB = (\[[\s\S]*?\n\]);/);
if (!m) { console.log('FAIL: EX_LIB not found'); process.exit(1); }
" 
```
Plus a verification script (write it as scripts/check-exlib.mjs or run inline): extract EX_LIB by importing is hard (JSX) — instead run these greps/counts and a node check:
```
grep -c "video:" src/Forge.jsx     # expect 50
grep -c "cues: \[" src/Forge.jsx   # >= 50 (library) — plus the 6 in `workout` = expect 56 total if formatted with that spacing; report actual and explain
grep -c "Exercise library" src/Forge.jsx  # 1
grep -c "YQ2s_Y7g5Qk" src/Forge.jsx # 1
grep -c "5kyLUGVq_pk" src/Forge.jsx # 1
```
And verify base parity: for each of the 25 sessionCycle exercises, its `base` in sessionCycle equals the EX_LIB base (do this by reading both blocks carefully or with a small node script over the source text). Report PASS/FAIL per check with actual output.
