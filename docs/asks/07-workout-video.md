# Ask 07 — Form video inside the active workout

## Context
Repo: `/Users/sm-pro/Projects/forge`, file `src/Forge.jsx`. The active-workout screen
(`tab === "train" && active`) computes `const ex = workout.exercises[active.i]` and ends with a
"Log set" button plus a row containing "Form cue" and "End workout" buttons. `VIDEO_IDS` (module
map) and the 16:9 embed pattern already exist in the exercise Sheet's Instruction tab. Only edit
`src/Forge.jsx`; no servers.

## The unit
Directly BELOW the "Form cue" / "End workout" button row, when `VIDEO_IDS[ex.name]` exists, render
the same 16:9 embed used in the Instruction tab:
- wrapper: `position: "relative", paddingTop: "56.25%", borderRadius: 14, overflow: "hidden",
  background: C.surface2, border: `1px solid ${C.line}`, margin: "14px 0 0", textAlign: "left"`
- iframe: absolute inset 0, 100%×100%, border 0, `src` = youtube-nocookie embed of
  `VIDEO_IDS[ex.name]`, `title` = `${ex.name} — form video`, `loading="lazy"`, `allowFullScreen`,
  same `allow` attribute as the existing embed. Include `key={ex.name}` on the iframe so it swaps
  cleanly when the exercise advances.
- caption under it, muted 11px, textAlign left: `Form demo · YouTube`
No video in the map → render nothing.

## Guardrails
Nothing else on the active screen changes. No new deps.

## Green-light
```bash
npm run build                              # exit 0
grep -c "youtube-nocookie" src/Forge.jsx   # 2
```
