# Ask 20 — Sign-in onboarding: device connect + readiness survey

## Objective
On sign-in the user sees whether their fitness device is connected (dropdown to pick one if not), then takes a readiness survey (sleep/mood/energy/stress/soreness/hydration, 1–5 each) that computes the readiness score shown on the homepage ring and trend.

## Changes (src/Forge.jsx only)

### 1. Login screen — device status
New localStorage key `forge.device` (string device name, or absent).
Component state: `const [device, setDevice] = useState(() => localStorage.getItem("forge.device") || "");`
On the login screen, between the password input and the Sign in button, add a device row:
- If `device` is set: a Card-like row (background C.surface, border C.line, borderRadius 14, padding "12px 14px", marginBottom 14, display flex, gap 10, alignItems center) with a lucide `Watch` icon (16, C.recovery), text `${device} connected` (C.body, 13), a small green dot (8px circle, background C.recovery), and a "Change" text button (background none, border none, C.muted, fontSize 12, underline) that clears to the picker state (setDevice("") and remove the localStorage key — picker shows; do not lose the saved value until a new pick is made: actually simply show the select prefilled).
- If not set: a `<select>` styled like the existing `inp` style (same background/border/height; color C.muted until a value chosen) with a disabled placeholder option "Connect your fitness device…" and options: Samsung Galaxy Watch, Apple Watch, Garmin, Whoop, Fitbit, Oura Ring, Polar, No device. On change: `localStorage.setItem("forge.device", value); setDevice(value);` (choosing "No device" stores it too — row then reads "No device connected" with the dot colored C.muted instead of green).

### 2. Readiness survey screen
Sign in button: instead of `setScreen("app")` →
```js
const todayKey = `forge.readiness.${iso(TODAY)}`;
setScreen(localStorage.getItem(todayKey) ? "app" : "survey");
```
New screen branch `screen === "survey"` (place it right after the login branch, same full-page wrapper pattern: minHeight 100vh, C.bg, css style tag, centered column, maxWidth 430, padding 20, overflowY auto, paddingBottom ~120 for the sticky footer):

Module-level data:
```js
const SURVEY_QS = [
  { key: "sleep",     label: "Sleep",     icon: Moon,     opts: ["Awful", "Poor", "Ok", "Good", "Excellent"] },
  { key: "mood",      label: "Mood",      icon: Smile,    opts: ["Very poor", "A little off", "Ok", "Good", "Great!"] },
  { key: "energy",    label: "Energy",    icon: Zap,      opts: ["Wiped out", "Tired", "Ok", "Good", "Amped up"] },
  { key: "stress",    label: "Stress",    icon: Brain,    opts: ["Buried", "Strained", "Ok", "Not much", "Relaxed"] },
  { key: "soreness",  label: "Soreness",  icon: Dumbbell, opts: ["Very sore", "Pretty sore", "Moderate", "Just a bit", "None at all"] },
  { key: "hydration", label: "Hydration", icon: Droplets, opts: ["Parched", "Low", "Ok", "Good", "Topped up"] },
];
const SURVEY_COLORS = ["#EF1E19", "#F97316", "#F5A623", "#8BC34A", "#4FD8BC"]; // 1..5
```
(lucide imports: Moon, Zap already exist — check; add Smile, Brain, Dumbbell, Droplets as needed.)

Survey UI:
- Header: h1 "Readiness Survey" (ff-d, 30–36, 700, uppercase, C.text) + sub-label "TELL US HOW YOU FEEL" (11, 600, C.muted, letterSpacing .14em, uppercase).
- State: `const [survey, setSurvey] = useState({});` (key → 1..5).
- Each question block (marginTop 26): row with label (ff-d, 22, 700, uppercase, C.text) left and the icon (size 26, color C.muted, strokeWidth 1.5) right; below, a 5-column grid (display grid, gridTemplateColumns "repeat(5, 1fr)", gap 8): each option a button — border `1px solid ${selected ? SURVEY_COLORS[v-1] : C.lineStrong}`, background selected ? tint of that color (use `${color}1F` hex-alpha... use rgba via a helper or just `background: selected ? "rgba(255,255,255,.04)" : "transparent"` with the colored border and a subtle boxShadow `inset 0 0 0 1px ${color}` when selected), borderRadius 12, padding "16px 0 14px", the number (ff-d, 26, 800, color SURVEY_COLORS[v-1]) centered. Below each button, the option word (fontSize 10.5, color selected ? C.text : C.muted, textAlign center, marginTop 6). Put number-button and word in a column so the grid cell holds both (make the whole cell clickable: wrap cell in a button containing number + word, word inside the button below the number is fine — then the button padding shrinks: number 24, word 9.5, padding "12px 2px").
- Sticky footer (position fixed, bottom 0, left 0, right 0, display flex, justifyContent center): inner bar maxWidth 430, width 100%, background rgba(13,15,20,.92), backdropFilter blur(8px), borderTop 1px C.line, padding "14px 20px calc(14px + env(safe-area-inset-bottom))", flex row space-between alignItems center:
  - Left: "Skip" button (background none, border none, C.muted, 13) → `setScreen("app")` without saving.
  - Center: `Completed ${answered} / 6` (C.body, 13).
  - Right: "Finish" primary button (btnP style, padding "0 22px", minHeight 44, opacity answered===6 ? 1 : .45, disabled until 6/6) → compute + save + enter app (below).

### 3. Score computation and homepage wiring
On Finish:
```js
const sum = Object.values(survey).reduce((s, v) => s + v, 0);
const score = Math.round((sum / 30) * 100);           // 6 questions × max 5
localStorage.setItem(todayKey, JSON.stringify({ score, answers: survey }));
setReadyToday(score);
setScreen("app");
speak(`Readiness logged at ${score}. ${score >= 75 ? "Green light — we push today." : score >= 55 ? "Solid enough. We work smart today." : "Running low — we keep it tight and honest today."}`);
```
Homepage wiring — currently `READINESS_TODAY` is a module const (82) used by `readinessSeries`, `recentAvg`, `openReadiness`, and the Today ring. Refactor:
- Component state: `const [readyToday, setReadyToday] = useState(() => { try { const s = JSON.parse(localStorage.getItem(`forge.readiness.${iso(TODAY)}`)); return s?.score ?? READINESS_TODAY; } catch { return READINESS_TODAY; } });`
- Convert `readinessSeries` into a module function `readinessSeriesFor(todayScore)` (same body, parameterized), and `recentAvg` into `recentAvgFor(series)`. Keep `longAvg` as is.
- In the component: `const readinessSeries = useMemo(() => readinessSeriesFor(readyToday), [readyToday]); const recentAvg = recentAvgFor(readinessSeries);`
- Every existing usage (Today ring score, readiness sheet chart, openReadiness speak line, Progress tab chart if it uses the series) now uses these component values. Search all usages of `READINESS_TODAY`, `readinessSeries`, `recentAvg` and rewire — the ring on the homepage must show `readyToday`.

## Hard rules
- No speechSynthesis. localStorage keys: only `forge.device` and `forge.readiness.<iso>` added.
- `speak` is defined inside the component — the Finish handler is inside too, so fine.
- Survey renders before `screen === "app"`; it must include the `<style>{css}</style>` tag like the login screen so fonts/scrollbar rules apply.
- Minimal diff elsewhere.

## Green-light
```
cd ~/Projects/forge && npm run build
grep -c "forge.device" src/Forge.jsx          # >= 2
grep -c "forge.readiness" src/Forge.jsx       # >= 2
grep -c "SURVEY_QS" src/Forge.jsx             # 2 (def + map)
grep -c "Completed " src/Forge.jsx            # >= 1
grep -c "speechSynthesis" src/Forge.jsx       # 0
node -e "const s=[5,5,5,5,5,5].reduce((a,b)=>a+b,0); console.log(Math.round(s/30*100)===100 ? 'PASS' : 'FAIL')"
```
Report actual outputs.
