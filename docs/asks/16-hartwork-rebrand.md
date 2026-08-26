# Ask 16 — Rebrand Forge → HARTWORK (logo red/black colorway)

## Context
Brand assets in `public/brand/` (hartwork_logo.svg, hartwork.png) — official palette
red `#EF1E19`, black `#090909`, white. The app keeps its dark shell; red REPLACES amber as the
brand/energy color; teal (`C.recovery`) stays as the semantic recovery/success color. Files you
may touch: `src/Forge.jsx`, `index.html`, `README.md`, `netlify/functions/food.mjs`. Do NOT
rename localStorage keys (still `forge.*` — persistence compat) and do NOT touch
`netlify/functions/tts.mjs` or voice logic.

## The unit
1. **Tokens** in `C` (src/Forge.jsx): `energy: "#EF1E19"`, `energyDeep: "#B01310"`,
   `inkOnEnergy: "#FFFFFF"` (white ink — red cannot carry the old dark ink).
2. **Every amber literal** swaps to the red equivalent, same alphas:
   `rgba(247,183,51,X)` → `rgba(239,30,25,X)` at lines ~329, 397, 785, 1357, 1358, 1465, 1466,
   1778 (grep `247,183,51` afterwards must return 0). `#F7B733`/`#C98F1B` only exist in the token
   line being replaced.
3. **New `HartMark` component** (module level, near `Ring`): inline SVG, prop `size` (default 30).
   viewBox "0 0 64 48". Draw: (a) heart outline — stroke `#FFFFFF` (use prop `heart` default
   "#fff"), strokeWidth 4.5, fill none, classic heart path centered ~x32 spanning y4–y44;
   (b) horizontal bar through the heart's midline (y≈24) in `#EF1E19` strokeWidth 4 from x2 to
   x62, interrupted mid-heart by (c) an EKG pulse: polyline in the same red (flat → small dip →
   tall spike → flat), strokeWidth 4, strokeLinejoin round; (d) barbell plates: two short vertical
   rounded rects each side (x2–x10 and x54–x62 area, heights 18 and 12) in `#FFFFFF`.
   Keep it clean at 30px. `aria-hidden="true"`.
4. **Wordmark**: everywhere the app shows "Forge"/"FORGE":
   - Header: replace the gradient Dumbbell square + "Forge" span with `<HartMark size={30} />` +
     wordmark: `ff-d` 23px 800 uppercase — `<span style={{color:"#EF1E19"}}>Hart</span><span
     style={{color:C.text}}>work</span>` (renders HARTWORK via the existing uppercase transform).
   - Login: replace the 56px gradient square with `<HartMark size={64} />`; the 58px "Forge" title
     becomes the same two-tone Hartwork wordmark (HART red / WORK white).
5. **Renames**:
   - `index.html`: `<title>HARTWORK — AI Training</title>` + add
     `<link rel="icon" href="/brand/hartwork_logo.svg" />` in head.
   - CSV filename: `forge-history-` → `hartwork-history-`.
   - `netlify/functions/food.mjs` UA string: `Forge-Prototype/1.0` → `Hartwork-Prototype/1.0`.
   - `README.md`: title `# Hartwork` and first line mentions HARTWORK (keep the rest).
6. **Contrast sweep** (because inkOnEnergy is now white): the orb's inner number/labels, the
   `btnP` primary buttons, `Badge` letters, and current-dot states all read `C.inkOnEnergy` or
   `C.energy` from tokens and adjust automatically — verify by grep that NO other literal amber or
   dark-ink-on-energy assumptions remain (search `#181206`; replace any stragglers with
   `C.inkOnEnergy`).

## Green-light
```bash
npm run build                                    # exit 0
grep -c "247,183,51" src/Forge.jsx               # 0
grep -c "F7B733\|C98F1B\|#181206" src/Forge.jsx  # 0
grep -c "EF1E19" src/Forge.jsx                   # ≥ 4
grep -c "HartMark" src/Forge.jsx                 # ≥ 3
grep -ci "hartwork" index.html                   # ≥ 2
grep -c "Forge" src/Forge.jsx                    # 0 visible-name check: only allowed if part of a localStorage key string "forge." — count those separately and explain any remainder
```
