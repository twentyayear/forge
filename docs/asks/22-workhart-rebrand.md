# Ask 22 — WORKHART rebrand: name + black/white/blue colorway

## Objective
The app is renamed **HARTWORK → WORKHART** with a new logo and palette. The UI becomes true black & white (neutral grays — kill the blue-navy cast of the current surfaces) with a single blue accent **#29ABE2** taken from the logo. New brand assets are ALREADY in `public/brand/` (do not regenerate): `workhart_mark.png` (blue pulse mark), `workhart_text_logo.png` (WORK white + HART blue wordmark — dark backgrounds only), `workhart_lockup.png`, `workhart_favicon.png` (128×128).

## 1. Tokens (src/Forge.jsx, the `C` const at line ~11)
Replace with exactly:
```js
const C = {
  bg: "#0A0A0B", surface: "#141416", surface2: "#1B1B1F",
  line: "#26262B", lineStrong: "#3B3B44",
  text: "#F4F4F6", body: "#C9C9CF", muted: "#8C8C95",
  energy: "#29ABE2", energyDeep: "#1B7FB2",
  recovery: "#7ACBEF", inkOnEnergy: "#081C28",
};
```
(`inkOnEnergy` flips to dark: near-black text on blue buttons is far more readable than white on #29ABE2. `recovery` becomes a lighter blue — the palette stays black/white/blue only.)

## 2. Survey colors (line ~454)
```js
const SURVEY_COLORS = ["#63636C", "#84848E", "#7FB6D6", "#4FBCEC", "#29ABE2"]; // 1..5
```
(1–2 neutral gray → 5 full accent blue; no red/orange/green anywhere.)

## 3. Hardcoded rgba sweep (same alphas, new rgb)
- Every `rgba(239,30,25,X)` → `rgba(41,171,226,X)`  (energy red → blue; ~8 sites incl. lines ~465, 540, 1054, 1308–9, 1670–1, 1787, 2192)
- Every `rgba(79,216,188,X)` → `rgba(122,203,239,X)`  (teal → light blue; ~5 sites incl. ~465, 1417, 1421, 1902)
- Line ~1031 nav backdrop `rgba(13,15,20,.92)` → `rgba(10,10,11,.92)` (matches new bg)

## 4. Brand assets & mark
- `HartMark` component (~line 480): img src → `/brand/workhart_mark.png` (same sizing API — height = size, width auto).
- Both `hartwork_text_logo.png` img tags (~941 login, ~1050 header): src → `/brand/workhart_text_logo.png`, alt → `"Workhart"`.

## 5. Name strings
- `index.html`: title → `WORKHART — AI Training`; favicon → `<link rel="icon" type="image/png" href="/brand/workhart_favicon.png" />`
- src/Forge.jsx: CSV download filename `hartwork-history-` → `workhart-history-`; both `Head Coach · HARTWORK` → `Head Coach · WORKHART` (~1764, ~2160).

## Hard rules
- Repo/dir names and ALL localStorage keys stay `forge.*` — user-facing strings only.
- No speechSynthesis. No changes to tts.mjs, voice recipe, EX_LIB, PROGRAM_40, or any logic — this is a pure skin/rename unit. Minimal diff.
- Do not delete the old hartwork assets from public/brand (Sam decides deletions).

## Green-light (report each PASS/FAIL with actual output)
```
cd ~/Projects/forge && npm run build
grep -c "EF1E19\|B01310\|4FD8BC" src/Forge.jsx          # 0
grep -c "239,30\|239, 30\|79,216\|79, 216" src/Forge.jsx # 0
grep -ci "hartwork" src/Forge.jsx index.html             # 0 in each
grep -c "29ABE2" src/Forge.jsx                           # >= 2
grep -c "workhart" index.html                            # >= 1
ls public/brand/workhart_mark.png public/brand/workhart_text_logo.png public/brand/workhart_favicon.png
```
