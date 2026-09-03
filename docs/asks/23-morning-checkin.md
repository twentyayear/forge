# Ask 23 — Replace the readiness survey with a "Morning check-in" flow

## Objective
The current survey (one long page, section headers with icons, numbered 1–5 boxes with word labels) is visually and conceptually a TrainHeroic clone. Replace it with an original one-question-at-a-time flow: word-first answer cards, no visible number scale, auto-advance, blue progress bar. **Function is unchanged**: computes a 0–100 readiness score, stores `forge.readiness.<iso>` as `{score, answers}`, sets `readyToday`, speaks the same Kyle line, Skip still bails to the app, and sign-in still routes here only when today has no entry. Everything outside the survey screen and its data defs stays untouched.

## 1. New question data (replaces SURVEY_QS + SURVEY_COLORS at ~line 446)
Delete `SURVEY_COLORS` entirely (nothing else uses it — verify with grep before deleting). Replace `SURVEY_QS` with:

```js
// ---- Morning check-in ----
// 7 questions, 4 answers each; answer index IS its point value (0..3), max 21
const CHECKIN_QS = [
  { key: "hours",    q: "How much sleep did you get?",
    opts: ["Under 5 hours", "5–6 hours", "6–7 hours", "7 or more"] },
  { key: "sleep",    q: "How did you sleep?",
    opts: ["Tossed and turned", "Woke up a few times", "Mostly solid", "Slept like a rock"] },
  { key: "soreness", q: "How's your body feeling?",
    opts: ["Beat up — everything aches", "Sore in a few spots", "A little stiff", "Fresh and loose"] },
  { key: "energy",   q: "Where's your energy right now?",
    opts: ["Running on empty", "Dragging a bit", "Steady", "Fully charged"] },
  { key: "stress",   q: "How's your head?",
    opts: ["Overloaded", "Carrying some stress", "Mostly clear", "Calm and focused"] },
  { key: "fuel",     q: "How was your eating yesterday?",
    opts: ["Barely ate, or all junk", "Hit and miss", "Pretty solid", "Dialed in"] },
  { key: "drive",    q: "How much do you want to train today?",
    opts: ["Not at all", "I'll show up", "Ready to work", "Can't wait"] },
];
```
(Old mood + hydration questions are gone; sleep-hours, nutrition and motivation are new.)

## 2. Rebuild the `screen === "survey"` branch (~line 979)
New state: `const [checkStep, setCheckStep] = useState(0);` (declare with the other survey state; keep the existing `survey` answers object — values are now 0–3).

Score math in `finishSurvey` (keep the function name, storage key, `setReadyToday`, `setScreen("app")`, and the `speak(...)` line EXACTLY as they are): `const score = Math.round((sum / 21) * 100);` where sum is over the 0–3 values.

Layout (one question visible at a time, `q = CHECKIN_QS[checkStep]`):
- **Top bar** (maxWidth 430): row with "MORNING CHECK-IN" (ff-b, 11, 600, C.muted, letterSpacing .14em, uppercase) left and a `Skip` text button right (same handler as today: `setScreen("app")`). Under it a 3px full-width progress track (C.line, borderRadius 2) with a blue fill (C.energy, same radius, `width: ${(checkStep / CHECKIN_QS.length) * 100}%`, `transition: width .25s ease`).
- **Body** (flex column, justifyContent center, flex 1, minHeight ~70vh): eyebrow "QUESTION {checkStep+1} OF 7" (ff-b 11 600 C.muted letterSpacing .14em); the question `q.q` in ff-d, fontSize 30, fontWeight 700, color C.text, **sentence case — NOT uppercase** (no textTransform), lineHeight 1.15, margin "10px 0 26px".
- **Answer cards**: 4 stacked full-width buttons (flexDirection column, gap 10). Each: textAlign left, padding "16px 18px", borderRadius 14, fontSize 15, fontWeight 600, background C.surface, border `1px solid ${C.line}`, color C.body. Selected (survey[q.key] === i): border `1px solid ${C.energy}`, background "rgba(41,171,226,.10)", color C.text. NO numbers, NO icons, NO color-per-option scale.
- **Tap behavior**: `setSurvey((cur) => ({ ...cur, [q.key]: i }))` (functional — hard rule), then after 180ms (`setTimeout`): if `checkStep < CHECKIN_QS.length - 1` → `setCheckStep(checkStep + 1)`; else → `finishSurvey()` (compute sum from the updated answers — build the next answers object first and use it for both setSurvey and the finish math so the timeout doesn't read stale state).
- **Back**: below the cards, a muted text button "‹ Back" (visible only when checkStep > 0) → `setCheckStep(checkStep - 1)`. Revisited questions show the previously selected card.
- Remove the old fixed bottom bar, the "Completed n / 6" counter, and the Finish button entirely — the last answer finishes the flow.

## Hard rules
- Storage key `forge.readiness.<iso>` and its `{score, answers}` shape stay; homepage ring/trend code untouched.
- The `speak(...)` finish line, `readinessSeriesFor`, `recentAvgFor`, sign-in routing: untouched.
- No speechSynthesis. No new localStorage keys. Minimal diff — only the survey data block and the survey screen branch change.
- If Moon/Smile/Zap/Brain/Dumbbell/Droplets icon imports become unused after this, remove ONLY the ones with zero remaining usages in the file.

## Green-light (report each PASS/FAIL with actual output)
```
cd ~/Projects/forge && npm run build
grep -c "SURVEY_COLORS" src/Forge.jsx        # 0
grep -c "CHECKIN_QS" src/Forge.jsx           # >= 3
grep -c "checkStep" src/Forge.jsx            # >= 5
grep -c "/ 21" src/Forge.jsx                 # 1 (score math)
grep -c "Completed " src/Forge.jsx           # 0
grep -c "forge.readiness" src/Forge.jsx      # unchanged from before (3)
node --input-type=module -e "import {readFileSync} from 'fs'; const s=readFileSync('src/Forge.jsx','utf8'); const m=s.match(/const CHECKIN_QS = (\[[\s\S]*?\n\]);/); const qs=eval(m[1]); console.log(qs.length===7 && qs.every(q=>q.opts.length===4) ? 'PASS 7x4' : 'FAIL');"
```
