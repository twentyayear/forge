# WORKHART

AI-coached fitness app. Prototype LIVE at workhart.netlify.app (Netlify CI off `main`, repo PUBLIC: twentyayear/forge — GitHub repo not yet renamed). Backend milestone building at **alphaecho.io** (DO droplet 137.184.19.44, `ssh workhart`; deploy rail in `docs/DEPLOY.md`). Current position: see `docs/PRD.md` — U10 (server-mode data honesty: PR/Max chips, exercise-detail sheet, Readiness long-term average and history CSV now read real server data; device picker added to server-mode Settings; pure helpers in `src/history.js` + `node --test src/history.test.js`) FULLY green 2026-10-15 — both builds pass, 6/6 helper tests, prototype mode verified unchanged on :4890, LIVE values matched psql for `hey+gl@`. Known gap: the server CSV interleaves exercises (sorted by per-exercise `set_no`). U9 (IDOR sweep, 60/60 server tests) green the same day. Next: U11 (ask 37, Sam's data cutover). M4 close-out units U9–U12 are in the PRD table; run them via the `chief-of-staff` skill.

## OVERHAUL ROUND (running since 2026-10-21)
**Current position:** W.9 trainer core GREEN and deployed (37/37 frontend, 124/124 server; `src/trainer/` TrainerShell, Roster with needs-you, Client page (week, trend, assign, enrol, thread, auto-send), AddClientSheet; `GET /api/admin/roster`; Build/Inbox/Drafts/You still served by the legacy console through `forcedView` until W.10). W.1–W.8 deployed before it. Next: W.10 trainer rest (Build, Programs, Inbox, Compose, Offers). KNOWN: the droplet's `ANTHROPIC_API_KEY` answers 401, so every AI path runs its fallback until Sam installs a new key.
Design round kit in `docs/comps/overhaul/`: `board.html` (published board with Sam's picks store), `SPEC.md` (binding), `EXECUTE.md` (the overnight run's complete prompt; start = "read docs/comps/overhaul/EXECUTE.md and execute it"). Rulings taken: one trainer built for many, lean core first, keep logo + blue, authority to commit/migrate/deploy each green unit to alphaecho.io. W.0 pins the Netlify prototype to branch `prototype` before `main` moves.

## Build workflow
Fable writes one ask at a time (`docs/asks/NN-*.md`) with a binary green-light; a fresh Sonnet session builds exactly that ask; Sam confirms green before the next. Build only what the ask says, then stop. Report green-light results PASS/FAIL with actual output.

## Hard rules (violating any of these fails the unit)
- **No `window.speechSynthesis` — ever.** Voice is ElevenLabs only.
- **Never print any part of any API key.** `ELEVENLABS_API_KEY` etc. live only in server/Netlify env. Secrets never in code, logs, chat, or commits.
- **Kyle voice recipe is Sam-tuned — do not alter without his word:** voice ID `ZAIovxRU9FXNYmauX8CL` (the ONLY allowed voice, server-side allowlist), model eleven_multilingual_v2, stability 0.5, similarity 0.75, style 0.2, speaker boost, speed 0.85, server inserts `<break time="0.6s" />` after sentence enders.
- localStorage keys are `workhart.*` (`src/main.jsx` copies old `forge.*` keys once). Folder, package and component are `workhart`; the GitHub repo is still `twentyayear/forge`.
- Repo stays PUBLIC (Netlify free plan blocks private-repo builds from noreply-authored commits).
- Multi-tenant discipline from day one: every backend query scoped by the session's user id; user/tenant id never trusted from raw request input.
- Commit only when Sam says so. Short imperative subjects. Ask before deleting anything.

## Conventions
- Frontend: Vite 6 + React 19, inline styles from `src/theme.js` (the only file with colour literals; `src/theme.test.js` pins it), `src/lib/api.js` the only `fetch`, `src/lib/speech.js` the only speaker, primitives in `src/ui/`, shell in `src/app/`, screens in `src/client/` and `src/trainer/` (legacy `src/Workhart.jsx` until W.10). Barlow Condensed (display) / Barlow (text). PWA: `public/manifest.webmanifest`, `public/sw.js` (never caches `/api/`).
- Dev server: port 4890 (`.claude/launch.json`, name `workhart`). `/api` dev proxy target in `vite.config.js` — restart the dev server after changing it.
- Brand assets in `public/brand/` (`workhart_*.png`); old hartwork files kept until Sam says delete.
- Backend (M4+): Node 22 + Express + Postgres 16 + pg-boss on the droplet; nginx serves the built frontend and proxies `/api`.

## Definition of done (every unit)
1. `npm run build` passes (plus the unit's own checks from its ask).
2. The ask's green-light block: every line run, PASS/FAIL reported with real output.
3. Live verification on the relevant environment (dev :4890 or alphaecho.io).
4. CLAUDE.md "current position" + `docs/PRD.md` updated at green.
