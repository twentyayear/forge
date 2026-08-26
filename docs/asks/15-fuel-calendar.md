# Ask 15 — Calendar strip on the Fuel tab

## Context
Repo: `/Users/sm-pro/Projects/forge`, file `src/Forge.jsx`. `CalendarStrip({ selected, onSelect,
doneToday })` renders the Today-tab strip; its dot logic reads `SCHEDULE` and its aria-labels name
sessions. Fuel tab state: `fuelLog` (`{[iso]: rows}`), `fuelTargets`, handlers
`addFuel`/`deleteFuel` hardcode `const day = iso(TODAY)`. `fmtLong`, `iso`, `TODAY`, `CAL_DAYS`
exist. Only edit `src/Forge.jsx`; no servers; no voice changes EXCEPT gating the existing
protein-target speak as described (its text unchanged).

## The unit
1. **Generalize `CalendarStrip`** (backward compatible): new optional props `dotFor` and
   `labelFor`. Default behavior when omitted = exactly current (SCHEDULE-based dot + label).
   When provided: `dotFor(k)` returns a color string or null (null → transparent dot);
   `labelFor(k, d)` returns the aria-label string. The Today-tab call site stays unchanged.
2. **Fuel tab day selection**:
   - State: `const [fuelDay, setFuelDay] = useState(iso(TODAY));`
   - At the top of the Fuel tab (before the h1): `<CalendarStrip selected={fuelDay}
     onSelect={setFuelDay} dotFor={...} labelFor={...} />` where dotFor: no rows or empty → null;
     rows with protein sum ≥ `fuelTargets.protein` → `C.recovery`; otherwise `C.energy`.
     labelFor: `` `${fmtLong(d)} — ${rows.length} foods, ${kcal} kcal` `` or `` `${fmtLong(d)} — nothing logged` ``.
   - Under the h1, the date line becomes `{fmtLong(new Date(fuelDay + "T00:00:00"))}` and, when
     `fuelDay !== iso(TODAY)`, a small energy Pill `Editing a past day` (or `future day`) beside it.
3. **Everything operates on the selected day**: totals/ring/kcal-left, the log list, quick add,
   search add, manual add, delete — replace the hardcoded `iso(TODAY)` day in `addFuel`/`deleteFuel`
   with `fuelDay` (thread it however is cleanest — the handlers may read the state directly).
4. **Voice gate**: the protein-target `speak` inside `addFuel` fires ONLY when `fuelDay ===
   iso(TODAY)` (backfilled days stay silent). Text and once-per-day logic unchanged.

## Guardrails
Today-tab strip pixel-identical (default props path). No changes to schedule data or other tabs.

## Green-light
```bash
npm run build                          # exit 0
grep -c "fuelDay" src/Forge.jsx        # ≥ 8
grep -c "dotFor" src/Forge.jsx         # ≥ 3
grep -c "<CalendarStrip" src/Forge.jsx # 2
```
