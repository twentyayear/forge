# Ask 19 — Coach tab: Kyle video placeholder + programs list

## Objective
The Coach tab gets (a) a video-message placeholder from Coach Kyle directly under the coach identity card, and (b) a "Programs" section of day-based workout routines — one free, the rest paywalled (greyed but legible, lock icon on the right).

## Changes (src/Forge.jsx only)

### 1. Video placeholder card
Directly below the coach identity card (and below the voiceStatus fail note if present), add a Card with padding 0 containing:
- A 16:9 media area (`aspectRatio: "16 / 9"`, background `C.surface2`, position relative, centered content, `borderRadius: "18px 18px 0 0"`, overflow hidden):
  - Centered red play button: 54px circle, background `C.energy`, white Play icon (lucide `Play`, size 22, fill "currentColor"), subtle box-shadow.
  - Top-left small pill: "WEEKLY MESSAGE" (fontSize 9, letterSpacing .12em, uppercase, muted, bg rgba(0,0,0,.35), padding 4px 8px, borderRadius 6).
  - A faint HartMark (the existing component, size ~90, opacity .12) positioned behind the play button (absolute, centered) so the placeholder isn't empty.
- Below the media area, a 12px-16px padded row: title "A word from Coach Kyle" (C.text, 14.5, 600), subtitle "This week's focus · 2:14" (C.muted, 11.5).
The whole card is a placeholder: `role="button"` with `aria-label="Play coach video (coming soon)"`, onClick does nothing visible except no-op — do NOT wire video playback.

### 2. Programs section
Module-level const near other data:
```js
const PROGRAMS = [
  { name: "40 Day Fitness",             meta: "40 days · 5 sessions/week",                     blurb: "Kyle's total-body reset. Show up, follow the day, get strong.", free: true },
  { name: "Runner's Workout",           meta: "8 weeks · 4 runs + 2 lifts/week",               blurb: "Engine work plus the lifting that keeps runners durable.", price: "$29" },
  { name: "Strength & Flexibility",     meta: "6 weeks · 3 lifts + 3 mobility days/week",      blurb: "Build strength without losing range of motion.", price: "$29" },
  { name: "Kettlebell Engine",          meta: "4 weeks · 3 sessions/week",                     blurb: "One bell, big conditioning. Swings, carries, complexes.", price: "$19" },
  { name: "One-on-One with Coach Kyle", meta: "Monthly · custom programming + weekly check-ins", blurb: "Direct line to Kyle. Your plan, adjusted every week.", price: "$149/mo" },
];
```
In the Coach tab, after the video card, add `<Label>Programs</Label>` and a `<Card style={{ padding: 0 }}>` listing PROGRAMS as rows (borderBottom between, same pattern as "Recent updates"):
- Each row: left column (name — C.text 14 600; meta — C.muted 11.5 marginTop 2; blurb — C.body 12 marginTop 4 lineHeight 1.45), right side vertically centered.
- Free row: full opacity, right side is a `<Pill tone="recovery">Included</Pill>` and the row has `role="button"` tabIndex 0 (no-op click is fine).
- Paid rows: the LEFT column wrapped with `opacity: .55` (text stays legible), right side shows price (C.muted, 11.5, fontWeight 600) above a lucide `Lock` icon (size 15, color C.muted) — stack them in a column aligned flex-end with gap 4. Row gets `aria-disabled="true"` and no button role.
- Import `Play` and `Lock` from lucide-react if not already imported.

## Hard rules
- No speechSynthesis. No new localStorage keys. Minimal diff — do not touch other tabs.

## Green-light
```
cd ~/Projects/forge && npm run build
grep -c "PROGRAMS" src/Forge.jsx          # >= 2 (def + render)
grep -c "40 Day Fitness" src/Forge.jsx    # 1
grep -c "One-on-One with Coach Kyle" src/Forge.jsx # 1
grep -c "A word from Coach Kyle" src/Forge.jsx # 1
```
Report actual outputs.
