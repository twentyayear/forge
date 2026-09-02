# Ask 17 — Coach Kyle: single voice + identity

## Objective
Coach Kyle is now the only coach and the only voice. His ElevenLabs voice ID is `ZAIovxRU9FXNYmauX8CL`. Remove every other voice and the voice picker. Default coach name becomes "Kyle".

## Changes

### netlify/functions/tts.mjs
- `ALLOWED_VOICES` becomes exactly `new Set(["ZAIovxRU9FXNYmauX8CL"])`. Nothing else changes.

### src/Forge.jsx
1. Delete the `EL_VOICES` array entirely. Replace with:
   ```js
   const KYLE_VOICE = "ZAIovxRU9FXNYmauX8CL";
   ```
2. Remove the `voicePick` state and the `pickVoice` function. `speak()` always sends `voice_id: KYLE_VOICE` (keep its override param removed too if it exists — no overrides anymore). Remove all reads/writes of `localStorage` key `forge.voice`.
3. Coach tab: delete the entire "Your coach's voice" `<Label>` + `<Card>` (the picker grid). Keep the `voiceStatus === "fail"` fallback note — move it to sit directly under the coach identity card as a small muted line (same text).
4. Default coach name: both fallbacks that currently say `"Mike Torres"` become `"Kyle"`. Also treat a stored `"Mike Torres"` as unset:
   ```js
   const [coach, setCoach] = useState(() => {
     const s = localStorage.getItem("forge.coach");
     return s && s !== "Mike Torres" ? s : "Kyle";
   });
   ```
   and `coachName` fallback `"Kyle"`.
5. Coach tab identity card subtitle: `"Head Coach · Ironworks Gym"` → `"Head Coach · HARTWORK"`.

## Hard rules
- NEVER introduce `window.speechSynthesis` in any form.
- Do not touch localStorage keys other than reads noted above; `forge.coach` key name stays.
- Do not restructure anything else; minimal diff.

## Green-light (all must pass)
```
cd ~/Projects/forge && npm run build
grep -c "EL_VOICES" src/Forge.jsx            # expect 0 (grep exits 1, count 0)
grep -c "ZAIovxRU9FXNYmauX8CL" src/Forge.jsx # expect 1
grep -c "ZAIovxRU9FXNYmauX8CL" netlify/functions/tts.mjs # expect 1
grep -c "Mike Torres" src/Forge.jsx           # expect 1 (only inside the migration check) — verify it is ONLY in the useState migration
grep -c "forge.voice" src/Forge.jsx           # expect 0
grep -c "speechSynthesis" src/Forge.jsx       # expect 0
grep -c "pickVoice\|voicePick" src/Forge.jsx  # expect 0
```
Report each result plainly.
