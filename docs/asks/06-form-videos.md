# Ask 06 — YouTube form videos in the exercise sheet

## Context
Repo: `/Users/sm-pro/Projects/forge`, file `src/Forge.jsx`. The exercise detail Sheet
(`exDetail`/`exTab`) has History and Instruction tabs. Only edit `src/Forge.jsx`; no servers;
voice code byte-identical.

## The unit
1. Module level (near `exHistory`), add EXACTLY this map — these IDs were researched and verified
   embeddable; do not invent, alter, or add IDs:
```js
const VIDEO_IDS = {
  "Back Squat": "my0tLDaWyDU",
  "Barbell Bench Press": "4Y2ZdHCOXok",
  "Barbell Curl": "QZEqB6wUPxQ",
  "Barbell Row": "FWJR5Ve8bnQ",
  "Cable Lateral Raise": "Sp8be0IFNvk",
  "Close-Grip Bench Press": "UYJsFzqdgK4",
  "Deadlift": "XxWcirHIwVo",
  "EZ-Bar Curl": "5NsFLGUf0Fo",
  "Incline DB Press": "IP4oeKh1Sd4",
  "Kettlebell Swing": "DqkYuWR4zRI",
  "Leg Press": "FNTd_mxtWmo",
  "Overhead Rope Extension": "Fwl0T1_giQ0",
  "Plank Hold": "6LqqeBtFn9M",
  "Pull-Up": "eGo4IYlbE5g",
  "Push Press": "gFmV302JErc",
  "Push-Up Finisher": "I9fsqKE5XHo",
  "Romanian Deadlift": "5zmlnbWb-g4",
  "Rowing Sprint": "mrexeRFo4UM",
  "Seated Cable Row": "vwHG9Jfu4sw",
  "Seated DB Shoulder Press": "vlFGTI5JzjI",
  "Sled Push": "9XRRXaUpnLk",
  "Standing Calf Raise": "k8ipHzKeAkQ",
  "Triceps Pushdown": "8WL0m0vLAPo",
  "Walking Lunge": "Pbmj6xPo-Hw",
  "Weighted Pull-Up": "Sj7k-tOFdsM",
};
```
2. Instruction tab of the exercise Sheet: ABOVE the cues, when `VIDEO_IDS[exDetail]` exists, render
   a responsive 16:9 embed:
   - wrapper div: `position: "relative", paddingTop: "56.25%", borderRadius: 14, overflow: "hidden",
     background: C.surface2, border: `1px solid ${C.line}`, marginBottom: 14`
   - iframe: `position: "absolute", inset: 0, width: "100%", height: "100%", border: 0`,
     `src={`https://www.youtube-nocookie.com/embed/${VIDEO_IDS[exDetail]}`}`,
     `title={`${exDetail} — form video`}`, `loading="lazy"`, `allowFullScreen`,
     `allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"`
   - under it a muted 11px line: `Form demo · YouTube`
   When no entry exists in the map, render nothing extra (cues only, as today).

## Guardrails
No new deps. Nothing else changes — History tab, triggers, data untouched.

## Green-light
```bash
npm run build                                 # exit 0
grep -c "youtube-nocookie" src/Forge.jsx      # 1
grep -c '"[A-Za-z0-9_-]*": "' src/Forge.jsx | cat   # informational
python3 -c "import re; s=open('src/Forge.jsx').read(); m=re.search(r'const VIDEO_IDS = {(.*?)};', s, re.S); print(len(re.findall(r':', m.group(1))))"   # must print 25
grep -c "speechSynthesis" src/Forge.jsx       # exactly 5
```
