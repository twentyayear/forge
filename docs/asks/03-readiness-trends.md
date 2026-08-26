# Ask 03 — Readiness trend sheet (TrainHeroic "Short-Term Trend" screen)

## Context
Repo: `/Users/sm-pro/Projects/forge`, file `src/Forge.jsx`. Asks 01–02 done: `SCHEDULE` entries for
past days carry `readiness` (62–91) and `intensity`; Today tab has a readiness-ring Card (`Ring`
score 82). Tokens in `C`; recharts (`LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip,
CartesianGrid`) already imported. lucide `X`, `TrendingUp`, `ChevronUp/Down` available (import more
if needed). Only edit `src/Forge.jsx`; no servers; existing voice code byte-identical — you MAY add
one new `speak(...)` call as described.

## The unit
### 1. Reusable `Sheet` component (module level, near `Ring`)
`function Sheet({ title, onClose, children })`: fixed inset-0 overlay `rgba(0,0,0,.65)`,
z-index 50, flex align-end justify-center; panel width 100% maxWidth 430, bg `C.surface`,
`borderRadius: "22px 22px 0 0"`, border `1px solid C.line`, padding "18px 20px 28px",
maxHeight "82vh", overflowY auto. Header row: `ff-d` uppercase 22px 700 title + X icon-button
(44px hit area, `aria-label="Close"`) calling `onClose`. Overlay click (but not panel click)
also closes. `role="dialog" aria-modal="true"`.

### 2. Readiness data (module level)
- `const READINESS_TODAY = 82;`
- Build `readinessSeries`: the last 10 calendar days ending today; for each day with a SCHEDULE
  entry having `readiness` push `{ d: "M/D", v: readiness }`; for today push `{ d: "M/D",
  v: READINESS_TODAY, today: true }`. Skip days without data (rest days).
- `longAvg` = round(mean of ALL past `readiness` values in SCHEDULE); `recentAvg` = round(mean of
  the last 3 points of `readinessSeries`).

### 3. Sheet content (state `const [showReadiness, setShowReadiness] = useState(false)` in `Forge()`)
Title: `Readiness`. Inside:
- Two-column row: "Long-term average" / big `ff-d` 34px number `longAvg`; "Recent average" /
  `recentAvg` in `C.recovery` with a small `TrendingUp` (or `TrendingDown` if lower) beside it.
- Muted 11px caption: `Here's how your scores are trending:` then a 5-column factor row —
  Sleep ↑ · Mood ↔ · Energy ↔ · Stress ↑ · Soreness ↑ (label 10px muted uppercase; arrow glyph
  text 16px, ↑ in `C.recovery`, ↔ in `C.muted`).
- Coach bubble: the `ava`-style "M" avatar + a `C.surface2` rounded bubble, 13px `C.body`:
  if `recentAvg >= longAvg`: `Your readiness is trending higher than usual. Recovering is part of
  training — and you're doing it well.` else a matching "lower than usual — ease off the accessories
  today" variant.
- Chart: `ResponsiveContainer` height 170 → `LineChart data={readinessSeries}` → dotted `Line`
  (`strokeDasharray="4 4"`, stroke `C.recovery`, strokeWidth 2), custom `dot` renderer: radius 3.5
  fill `C.recovery`, today's point radius 6 with a 2px `C.bg` stroke. XAxis dataKey "d"
  (tick 10px `C.muted`, no axis/tick lines), YAxis domain [40, 100] hidden or minimal. No grid or a
  faint `CartesianGrid` with stroke `C.line` vertical={false}.
- Footer line, muted 11.5px: `Synced from Whoop & Apple Watch · visible to Coach Mike`.

### 4. Trigger
Make the Today-tab readiness Card open the sheet: wrap/convert it so it is a real `<button>`
(full-width, textAlign left, same Card styling — or Card with role="button", tabIndex 0, onClick +
Enter key). Add a muted 11px "View trend ›" hint under the "7h 40m sleep…" line. On open ALSO call
`speak(\`Readiness ${READINESS_TODAY}. ${recentAvg >= longAvg ? "Trending above your baseline — green light to push." : "A touch under baseline — keep the top sets honest."}\`)` —
this is the one permitted new speak call. Render `{showReadiness && <Sheet ...>}` at the end of the
app shell (inside the maxWidth-430 wrapper, after the nav).

## Guardrails
No new deps/files. Don't touch CalendarStrip, schedule generation (read-only), Train/Progress/Coach
tabs, or any existing voice lines.

## Green-light (run all, report real output)
```bash
npm run build                                 # exit 0
grep -c "function Sheet" src/Forge.jsx        # 1
grep -c "showReadiness" src/Forge.jsx         # ≥ 3
grep -c "speechSynthesis" src/Forge.jsx       # exactly 5
```
