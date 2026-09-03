# WORKHART (repo name: forge)

AI-coached fitness app. Prototype LIVE at workhart.netlify.app (Netlify CI off `main`, repo PUBLIC: twentyayear/forge). Backend milestone building at **alphaecho.io** (DO droplet 137.184.19.44, `ssh workhart`; deploy rail in `docs/DEPLOY.md`). Current position: see `docs/PRD.md` — U3a (server data API + import) green 2026-09-03.

## Build workflow
Fable writes one ask at a time (`docs/asks/NN-*.md`) with a binary green-light; a fresh Sonnet session builds exactly that ask; Sam confirms green before the next. Build only what the ask says, then stop. Report green-light results PASS/FAIL with actual output.

## Hard rules (violating any of these fails the unit)
- **No `window.speechSynthesis` — ever.** Voice is ElevenLabs only.
- **Never print any part of any API key.** `ELEVENLABS_API_KEY` etc. live only in server/Netlify env. Secrets never in code, logs, chat, or commits.
- **Kyle voice recipe is Sam-tuned — do not alter without his word:** voice ID `ZAIovxRU9FXNYmauX8CL` (the ONLY allowed voice, server-side allowlist), model eleven_multilingual_v2, stability 0.5, similarity 0.75, style 0.2, speaker boost, speed 0.85, server inserts `<break time="0.6s" />` after sentence enders.
- localStorage keys stay `forge.*`. Repo/dir names stay `forge`. User-facing brand is WORKHART.
- Repo stays PUBLIC (Netlify free plan blocks private-repo builds from noreply-authored commits).
- Multi-tenant discipline from day one: every backend query scoped by the session's user id; user/tenant id never trusted from raw request input.
- Commit only when Sam says so. Short imperative subjects. Ask before deleting anything.

## Conventions
- Frontend: Vite 6 + React 19, ONE component file `src/Forge.jsx` (~2.2k lines), inline styles, tokens in the `C` const (black/white + blue #29ABE2), lucide-react icons, Space Grotesk (display) / Barlow Condensed.
- Dev server: port 4890 (`.claude/launch.json`, name `forge`). `/api` dev proxy target in `vite.config.js` — restart the dev server after changing it.
- Brand assets in `public/brand/` (`workhart_*.png`); old hartwork files kept until Sam says delete.
- Backend (M4+): Node 22 + Express + Postgres 16 + pg-boss on the droplet; nginx serves the built frontend and proxies `/api`.

## Definition of done (every unit)
1. `npm run build` passes (plus the unit's own checks from its ask).
2. The ask's green-light block: every line run, PASS/FAIL reported with real output.
3. Live verification on the relevant environment (dev :4890 or alphaecho.io).
4. CLAUDE.md "current position" + `docs/PRD.md` updated at green.
