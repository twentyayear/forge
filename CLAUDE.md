# WORKHART

AI-coached fitness app. Prototype LIVE at workhart.netlify.app (Netlify CI off `main`, repo PUBLIC: twentyayear/forge — GitHub repo not yet renamed). Backend milestone building at **alphaecho.io** (DO droplet 137.184.19.44, `ssh workhart`; deploy rail in `docs/DEPLOY.md`). Current position: see `docs/PRD.md` — U10 (server-mode data honesty: PR/Max chips, exercise-detail sheet, Readiness long-term average and history CSV now read real server data; device picker added to server-mode Settings; pure helpers in `src/history.js` + `node --test src/history.test.js`) FULLY green 2026-10-15 — both builds pass, 6/6 helper tests, prototype mode verified unchanged on :4890, LIVE values matched psql for `hey+gl@`. Known gap: the server CSV interleaves exercises (sorted by per-exercise `set_no`). U9 (IDOR sweep, 60/60 server tests) green the same day. Next: U11 (ask 37, Sam's data cutover). M4 close-out units U9–U12 are in the PRD table; run them via the `chief-of-staff` skill.

## OVERHAUL ROUND (W.1–W.10 COMPLETE 2026-10-21; W.11 close-out in this commit)
**Current position:** the overhaul round is COMPLETE and deployed on alphaecho.io: W.1–W.10 green, then the library grew to 60 exercises (`src/data/exercises.js`, every video oEmbed-verified) and six starter programs were seeded into Kyle's console from `server/data/programs.js` via `server/scripts/seed-programs.js` (idempotent by title; 127/127 server tests, 46/46 frontend). Open work lives in `docs/loose-ends.md`. The droplet's Anthropic key was replaced 2026-10-21 and a live coach line came back `source: ai`. Frozen record: `docs/comps/overhaul/SPEC.md` + `board.html`. Next: Sam's morning look (install on the phone, run a session, hear Kyle; add a client, build a program, enrol, compose), then night two from the SPEC's deferred list (Stripe subscriptions first). KNOWN: the droplet's `ANTHROPIC_API_KEY` answers 401, so every AI path runs its fallback until Sam installs a new key.
Frozen record in `docs/comps/overhaul/`: `board.html` (the board; picks in its store) and `SPEC.md` (binding rulings and decisions). The run's EXECUTE/GATES were salvaged into this file, `docs/PRD.md` and `docs/loose-ends.md`, then deleted. Rulings: one trainer built for many (`users.trainer_id`), lean core first, keep logo + blue (Barlow Condensed + Barlow), look A "Scoreboard". The Netlify prototype builds from branch `prototype` (frozen at `54525c5`); `main` is the real app.

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

## Where things are
| Need | Look in |
| --- | --- |
| Tokens, fonts, radii (the only colour literals) | `src/theme.js` (+ `src/theme.test.js` scans) |
| The only `fetch`; the only speaker | `src/lib/api.js`, `src/lib/speech.js` |
| Data constants (exercises, check-in, fuel, roles, dates) | `src/data/` (`exercises.test.js` pins 60 entries and that every program exercise exists) |
| Starter programs (pure data) + seed | `server/data/programs.js`, `server/scripts/seed-programs.js` (droplet: `node --env-file=/etc/workhart/env scripts/seed-programs.js <trainer email>`) |
| UI primitives | `src/ui/` (`index.js` exports) |
| Boot, sign-in, routing by role, install prompt | `src/app/` |
| Client screens + pure engine helpers | `src/client/` (`engine.js`, `fuel.js`, `coach.js`) |
| Trainer console | `src/trainer/` (`trainer.js` helpers) |
| Server routers | `server/app.js` mounts auth, routes, data, media, admin, messages, programs, coach, compose, offers |
| Registries (one source each) | `server/achievements.js`, `server/coach-bank.js`, `server/streaks.js` |
| Jobs | `server/jobs.js` + `scheduler.js` (daily-monitor, weekly-summary, unread-nudge) |
| Migrations (apply-once, cite by filename) | `server/migrations/` |
| Tests | `server/test/*.test.js` (named in `package.json`), `src/*.test.js src/data/*.test.js src/client/*.test.js src/trainer/*.test.js` |
| Open work | `docs/loose-ends.md` |

## Conventions
- Frontend: Vite 6 + React 19, inline styles from `src/theme.js` (the only file with colour literals; `src/theme.test.js` pins it), `src/lib/api.js` the only `fetch`, `src/lib/speech.js` the only speaker, primitives in `src/ui/`, shell in `src/app/`, screens in `src/client/` and `src/trainer/`. Barlow Condensed (display) / Barlow (text). PWA: `public/manifest.webmanifest`, `public/sw.js` (never caches `/api/`).
- Dev server: port 4890 (`.claude/launch.json`, name `workhart`). `/api` dev proxy target in `vite.config.js` — restart the dev server after changing it.
- Brand assets in `public/brand/` (`workhart_*.png`); old hartwork files kept until Sam says delete.
- Backend (M4+): Node 22 + Express + Postgres 16 + pg-boss on the droplet; nginx serves the built frontend and proxies `/api`.

## Definition of done (every unit)
1. `npm run build` passes (plus the unit's own checks from its ask).
2. The ask's green-light block: every line run, PASS/FAIL reported with real output.
3. Live verification on the relevant environment (dev :4890 or alphaecho.io).
4. CLAUDE.md "current position" + `docs/PRD.md` updated at green.

## Session traps
- Node 26 on this Mac prints `ℹ tests N` from `node --test` when piped; use `--test-reporter=tap` to grep `# pass`.
- In zsh an unquoted `$VAR` holding several `K=V` pairs is ONE word: `export` the test env instead of `env $R node …`; quote `--include="*.js"` or run greps under `bash -c`.
- Server tests: `cd server && export TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod && NODE_ENV=test node --test --test-reporter=tap test/*.test.js`; migrate the scratch DB first with `node node_modules/.bin/node-pg-migrate up -d TEST_DATABASE_URL`.
- `ops/deploy.sh` waits 3 s before its health check; a 502 there means the restart raced the boot, not a crash (`systemctl show workhart-api -p NRestarts`).
- Netlify's `updateSite` ignores a partial `repo` body; resend the whole `build_settings` object to change `repo_branch`.
- `src/theme.test.js` flags the substring `fetch(` anywhere outside `api.js`, so name reload functions `reload`/`load`, never `refetch`.
- Chrome's `javascript_tool` loses its context on `location.reload()`; reload in one call and script in the next.
- Sign in as a test account on alphaecho.io: `ssh workhart 'cd /srv/workhart/server && sudo -n node --env-file=/etc/workhart/env scripts/mint-link.js <email>'` (15-minute link). Never use Sam's own account for checks.
