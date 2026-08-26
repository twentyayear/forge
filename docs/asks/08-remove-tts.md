# Ask 08 — Delete browser text-to-speech (keep coach text lines)

## Context
Repo: `/Users/sm-pro/Projects/forge`, file `src/Forge.jsx`. Sam's decision: the
`window.speechSynthesis` robot voice must never be used — delete it. The coach's TEXT lines
(the `line` state rendered as the "Coach …" bubble) stay exactly as they are; `speak(text)`
survives as a text-only function. A real AI voice may be wired later. Only edit `src/Forge.jsx`.

## The unit
1. `speak` becomes exactly:
   `const speak = (text) => { setLine(text); };`
   (delete the `voiceOn` early-return and the whole speechSynthesis/utterance block).
2. Delete the mount-cleanup effect:
   `useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch (e) {} }, []);`
3. "End workout" button onClick: remove the `try { window.speechSynthesis?.cancel(); } catch (e) {}`
   part, keeping `log.length ? finish(log) : setActive(null)`.
4. Delete `voiceOn`/`setVoiceOn` state and the header "Voice" toggle button (the header keeps just
   the logo/title on the left; remove the right-side button entirely).
5. Delete `talking`/`setTalking` state and its render usages: the orb div loses
   `className={talking ? "orb-live" : ""}` and its opacity becomes a plain `.4`… actually keep the
   orb visible as-is but static: `style={{ position: "absolute", inset: 0, borderRadius: "50%",
   border: \`2px solid ${C.energy}\`, opacity: .4 }}` with no className; delete the
   `{talking && <div className="eq" …>}` block.
6. In the `css` template string: delete the `.orb-live` rule, the `orbPulse` keyframes, the `eq`
   keyframes and `.eq span` rules, and remove `.orb-live` / `.eq span` from the
   `prefers-reduced-motion` list (keep `.pop,.chip-in` there).
7. Remove now-unused lucide imports: `Volume2`, `VolumeX`, and `Mic` ONLY if `Mic` is no longer
   referenced (the Form cue button keeps its `Mic` icon — so keep `Mic`; check before removing
   anything else). Run a final grep for each removed identifier to prove zero references remain.

All `speak(...)` call sites stay (they now just set the coach line). Everything else untouched.

## Green-light
```bash
npm run build                                  # exit 0
grep -c "speechSynthesis" src/Forge.jsx        # 0
grep -c "voiceOn\|setTalking\|orb-live" src/Forge.jsx   # 0
grep -c "speak(" src/Forge.jsx                 # ≥ 6 (definition + call sites intact)
```
