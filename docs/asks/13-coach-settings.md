# Ask 13 — Settings sheet: editable coach name

## Context
Repo: `/Users/sm-pro/Projects/forge`, file `src/Forge.jsx`. `Sheet` component exists (used by
readiness + exercise detail). Header row currently: logo/title left, Voice toggle right. The coach
"Mike Torres" / "Coach Mike" / avatar letter "M" are hardcoded. `inp` input style exists. Only edit
`src/Forge.jsx`; no servers; the one `speak` line that names the coach changes ONLY its
interpolated name (listed below) — no other voice changes.

## The unit
1. **State** in `Forge()`:
   `const [coach, setCoach] = useState(() => localStorage.getItem("forge.coach") || "Mike Torres");`
   `const [showSettings, setShowSettings] = useState(false);`
   Derived consts in the component body:
   `const coachName = coach.trim() || "Mike Torres";`
   `const coachFirst = coachName.split(/\s+/)[0];`
   `const coachInitial = coachFirst[0].toUpperCase();`
2. **Header**: add a settings icon-button to the RIGHT of the Voice toggle (wrap both in the
   existing right-side flex or a small flex with gap 8): `Settings` icon 15 from lucide-react
   (add import), same pill styling as the Voice button but icon-only (padding "8px 11px",
   minHeight 38, border `1px solid C.line`, color `C.muted`), `aria-label="Settings"`,
   onClick `setShowSettings(true)`.
3. **Settings sheet** rendered with the other sheets:
   `{showSettings && <Sheet title="Settings" onClose={() => setShowSettings(false)}>}`
   - `<Label>Coach name</Label>` + text input (style `inp`, `aria-label="Coach name"`,
     maxLength 40) bound to `coach`; onChange: `setCoach(v)` AND
     `localStorage.setItem("forge.coach", v)`.
   - Muted 11.5px line under it: `Shown wherever your coach appears — and spoken by the voice.`
   - Below, a preview Card row: the `ava` avatar with `{coachInitial}` + name `{coachName}` 15.5px
     600 + `Head Coach · Ironworks Gym` muted 12.5px (mirrors the Coach-tab header card).
4. **Replace every hardcoded coach reference** with the derived values:
   - line ~578 `speak("Workout complete. Outstanding session — Coach Mike will see today's numbers tonight.")`
     → template literal with `Coach ${coachFirst}` (rest of sentence identical).
   - `<Label>From Coach Mike</Label>` → `From Coach {coachFirst}`
   - `Logged · synced to Coach Mike` → `…synced to Coach {coachFirst}`
   - `Unlocks on the day — Coach Mike may still adjust the plan.` → `…Coach {coachFirst}…`
   - `{workout.name} · logged & shared with Coach Mike` → `…with Coach {coachFirst}`
   - Coach tab header `Mike Torres` → `{coachName}`
   - `Message Coach Mike` button → `Message Coach {coachFirst}`
   - `{c.time} · seen by Coach Mike` → `…seen by Coach {coachFirst}`
   - `Synced from Whoop & Apple Watch · visible to Coach Mike` → `…visible to Coach {coachFirst}`
   - The three avatar letters `>M<` at ~750, ~1155, ~1326 → `{coachInitial}`
   After the edit, `grep -n "Mike" src/Forge.jsx` must return ONLY the localStorage default
   ("Mike Torres") occurrences (2: the useState fallback and the coachName fallback).

## Guardrails
No other voice lines, no other tabs' logic. Sheet pattern identical to existing sheets.

## Green-light
```bash
npm run build                          # exit 0
grep -c "Mike" src/Forge.jsx           # exactly 2 (the two fallbacks)
grep -c "coachFirst" src/Forge.jsx     # ≥ 8
grep -c "showSettings" src/Forge.jsx   # ≥ 3
```
