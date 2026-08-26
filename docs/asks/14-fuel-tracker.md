# Ask 14 — Fuel tab: food & nutrition tracker/calculator (ported from Fresh Start)

## Context
Repo: `/Users/sm-pro/Projects/forge`. Port of Sam's Fresh Start bariatric app's nutrition model —
READ `/Users/sm-pro/Projects/fresh-start/src/lib/openfoodfacts.ts` (per-serving vs per-100g
preference logic) for reference; do NOT modify anything in fresh-start. Forge pieces available:
`Sheet`, `Card`, `Label`, `Pill`, `Ring`, `MiniStat`, `Stepper`, `Badge`, `inp`/`btnP`/`btnG`
styles, `speak()`, `iso()`/`TODAY`, `Trash2`/`Plus`/`Minus`/`Check`/`Flame`/`X` icons (import more
if needed), nav tabs array, localStorage patterns (`forge.voice`, `forge.coach`). The tts function
(`netlify/functions/tts.mjs`) shows the function idiom; `netlify.toml` has a functions dir + per-
path redirects above the SPA catch-all; vite proxies `/api` to prod in dev.
Files you may touch: `src/Forge.jsx`, `netlify.toml`, NEW file `netlify/functions/food.mjs`.

## 1. New file `netlify/functions/food.mjs` — food search proxy (no key needed)
- GET only (405 otherwise). Query param `q`: trim, require 2–40 chars else 400.
- Fetch `https://search.openfoodfacts.org/search?q=<encoded>&page_size=8&fields=product_name,brands,serving_size,nutriments`
  with header `User-Agent: Forge-Prototype/1.0 (personal use)`. Non-OK → 502.
- Map `hits` (that API returns `hits: []`) to
  `{ name, brand, unit, kcal, protein, carbs, fat }` using Fresh Start's preference rule:
  if `nutriments["energy-kcal_serving"]` or `nutriments["proteins_serving"]` exists use the
  `_serving` values and `unit = serving_size || "serving"`, else `_100g` values and `unit =
  "100 g"`. Coerce non-finite to 0, round to 1 decimal. Skip hits with no name or all-zero macros.
- Respond JSON `{ results: [...] }`, headers `Content-Type: application/json`,
  `Cache-Control: public, max-age=300`. `export const config = { path: "/api/food" };`
- `netlify.toml`: add a `/api/food` → `/.netlify/functions/food` redirect ABOVE the SPA catch-all.

## 2. Fuel tab (5th nav tab) in `src/Forge.jsx`
Nav array gains `["fuel", "Fuel", Flame]` between "train" and "progress".

Module helpers:
- `const FUEL_QUICK = [ { name: "Protein shake", kcal: 160, protein: 30, carbs: 5, fat: 3 }, { name: "Chicken & rice", kcal: 520, protein: 45, carbs: 55, fat: 12 }, { name: "Greek yogurt", kcal: 150, protein: 15, carbs: 9, fat: 4 } ];`
- `loadFuelLog()` / `saveFuelLog(log)` — localStorage `forge.fuelLog`, shape `{ [isoDate]: [{ id, name, brand?, kcal, protein, carbs, fat }] }` (id = incrementing number). Wrap parse in try/catch → `{}`.
- Targets: localStorage `forge.fuelTargets`, default `{ kcal: 2400, protein: 160 }`.

State in `Forge()`: `fuelLog` (from loadFuelLog), `fuelTargets` (from storage/default), `foodQ`
(search input), `foodResults` (null | array), `foodBusy` (bool), `manualOpen` (bool), `manual`
({name:"", kcal:"", protein:"", carbs:"", fat:""}). Every fuelLog/fuelTargets mutation also writes
localStorage. Derived for today: `const fuelToday = fuelLog[iso(TODAY)] ?? [];` and totals
(kcal/protein/carbs/fat sums).

Tab layout, top to bottom (Forge idiom throughout):
1. h1 `Fuel` (same h1 style as other tabs) + muted date line `{fmtLong(TODAY)}`.
2. **Targets card**: flex — `Ring` showing protein % (`Math.min(100, round(protein/target*100))`;
   relabel inner caption by passing score only — reuse Ring as-is, it prints "Readiness"… instead
   DO NOT reuse Ring's label: add an optional `label` prop to `Ring` (default "Readiness") and pass
   `label="Protein"`) — plus right column: 15px 600 text `{kcalLeft} kcal left` (or `Over by {n}`
   in `C.energy` when negative), 12.5px muted `{totals.kcal} of {fuelTargets.kcal} kcal ·
   {totals.protein} of {fuelTargets.protein} g protein`. Under: MiniStat row — kcal, protein g,
   carbs g, fat g (today's totals, rounded).
3. **Quick add**: Label `Quick add` + chip row: one `btnG`-style compact button per FUEL_QUICK
   entry (`+ {name}`) that appends to today's log.
4. **Search**: Label `Add food` + Card: flex row — `inp`-style input (flex 1, marginBottom 0,
   placeholder `Search foods…`, Enter submits) + `btnP` compact `Search` button, disabled while
   `foodBusy` or query < 2 chars. Submit: `foodBusy` true → `fetch("/api/food?q=" +
   encodeURIComponent(q))` → set `foodResults` (on error set `foodResults = []`). Results list
   below in the same Card: each row — name 13.5px 600 (+ brand muted 11px) and macro line muted
   12px `{kcal} kcal · {protein}g P · {carbs}g C · {fat}g F · per {unit}` + right-side 36px `Plus`
   icon-button (`aria-label={`Add ${name}`}`) appending to today's log. Empty results →
   muted 12.5px `Nothing found — try a simpler term, or add it manually below.`
5. **Manual add**: borderless link-button `Add manually` toggling `manualOpen`; when open, a Card
   with `inp` fields Name (text) and kcal/Protein/Carbs/Fat (number, inputMode numeric, 2-col
   grid), and a `btnP` `Add to log` (disabled without name) that appends (numbers default 0) and
   clears/collapses.
6. **Today's log**: Label `Logged today` + Card: rows (divider borders like Recent updates) —
   name 13.5px 600 (+brand muted), macro line as in search results (no unit), `Trash2` 16
   icon-button right (`aria-label={`Delete ${name}`}`) removing the row. Empty state muted
   12.5px `Nothing logged yet.`
7. **Target calculator**: Label `Targets` + Card: `Stepper` for Bodyweight (lb, step 5, min 80,
   default from localStorage `forge.bodyweight` or 180, persists on change) + a 3-option segmented
   row (Cut / Maintain / Build — buttons, selected = energy border+text like the voice picker
   selection) + `btnG` full-width `Calculate targets`: kcal = weight × (12 | 14 | 16), protein =
   round(weight × 1.0 | 0.9 | 0.85), rounded to nearest 10 / 5; sets + persists `fuelTargets`.
   Muted 11px line under: `Or set them by eye — protein drives the ring.`
8. **Voice**: when appending a food entry pushes today's protein total from below the target to
   ≥ target, call `speak(\`Protein target hit — ${fuelTargets.protein} grams down. That's how you
   build.\`)` — at most once per day (track localStorage `forge.proteinSpokeDay` = iso date).

## Guardrails
No changes to Train/Today/Progress/Coach logic, schedule data, voices (one new speak line above),
or the tts function. `Ring` change is additive (default label preserved).

## Green-light
```bash
npm run build                                # exit 0
node --check netlify/functions/food.mjs      # exit 0
grep -c '"fuel"' src/Forge.jsx               # ≥ 2 (nav + tab block)
grep -c "forge.fuelLog" src/Forge.jsx        # ≥ 2
grep -c "api/food" netlify.toml              # 1
grep -c 'label="Protein"' src/Forge.jsx      # 1
```
