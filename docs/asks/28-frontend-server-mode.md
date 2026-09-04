# Ask 28 — U3b: Frontend server mode (sign-in, hydration, API writes, export/import)

## Objective
Wire `src/Forge.jsx` to the U3a backend behind a **build-time flag**, so the same `main` branch produces two builds:
- **Prototype mode** (Netlify, no flag): exactly today's localStorage behavior — plus one new Export button. workhart.netlify.app MUST NOT break.
- **Server mode** (droplet build only, `VITE_SERVER_MODE=1`): real magic-link sign-in, state hydrated from `GET /api/bootstrap`, all data writes through the API, one-shot import flow. No `forge.*` key is a source of truth in this mode.

Read `CLAUDE.md` first; hard rules apply (no speechSynthesis, never print secrets, commit nothing, ask before deleting).

## Measured facts (don't re-derive)
- Mode gate: Vite inlines only `VITE_`-prefixed env vars → `const SERVER_MODE = import.meta.env.VITE_SERVER_MODE === "1"`.
- Auth routes (server/auth.js): `POST /api/auth/request-link {email}` (200 generic even for unknown emails; 429 when rate-limited), `GET /api/auth/verify?token=` (sets `wh_session` cookie then 302 → `/`; bad/expired → 302 → `/?auth=expired`), `POST /api/auth/logout`, `GET /api/auth/me` (200 `{id,email,name,role}` | 401).
- Data routes (server/data.js): `GET /api/bootstrap` → `{user, profile, checkins:[{day,score,answers}], fuel:[{id,eaten_on,name,calories,protein_g,carbs_g,fat_g,source}], workoutLogs:[...]}`; `POST /api/checkins {day,score,answers}` (upsert); `POST /api/fuel-logs` (returns row w/ id) + `DELETE /api/fuel-logs/:id`; `PATCH /api/profile` (whitelist `bodyweight,fuelTargets,coach,device`); `POST /api/import` (409 if account has any checkins/fuel).
- Forge.jsx anchors: `screen` state starts `"login"` (659), fake Sign in button ~980 (goes to survey/app off today's `forge.readiness.<iso>` key), survey completion writes that key ~992, `loadFuelLog/saveFuelLog` 612–615, `loadFuelTargets/saveFuelTargets` 617–623, `addFuel` 803 / `deleteFuel` 826, bodyweight save ~863, device save ~965, coach save ~2164, readiness boot read ~666.
- `readinessSeriesFor` (419) and workout history read the mock `SCHEDULE` const — that stays mock in BOTH modes this unit (assigned workouts arrive in U5). Ignore `workoutLogs` from bootstrap for now.
- `/api/food` and `/api/tts` don't exist on the droplet until U4 — in server mode food search must fail soft (empty results + a quiet "search unavailable" note, no crash) and `speak()` failures stay silent (it already fails soft — verify, don't rebuild).
- `forge.proteinSpokeDay` (818) is a UI-nicety dedupe flag, not data of record — it may stay in localStorage in both modes.

## 1. Data layer + mode gate
Small seam, not a rewrite: in server mode keep a hydrated in-memory snapshot (from bootstrap) and route the existing load/save helpers through it; localStorage helpers keep working untouched in prototype mode. Every server-mode write = API call first, then update React state from the response; on non-OK show a small inline error (reuse existing style tokens) and do NOT update state. A 401 on any API call → drop to the sign-in screen.

## 2. Sign-in screen (server mode only)
Replace the fake login CTA with: email input → `POST /api/auth/request-link` → "Check your email" state (with a "use a different email" reset). If the URL has `?auth=expired`, show a "That link expired — request a new one" banner (and strip the param from the URL). On boot: `GET /api/auth/me`; 200 → fetch `/api/bootstrap`, hydrate, then route to survey or app exactly like today (survey if no checkin row for today); 401 → sign-in screen. Add a Sign out control in the settings/profile area (server mode only) → `POST /api/auth/logout` → sign-in screen. Prototype mode keeps the current fake login untouched.

## 3. Hydration mapping (server → existing state shapes)
- `checkins` → readiness: today's row → the boot read at ~666; the trend series must use real checkin rows in server mode (today + prior days from checkins, falling back to the mock only in prototype mode).
- `fuel` rows → `fuelLog` shape `{ "<eaten_on>": [{id, name, brand?, kcal, protein, carbs, fat}] }` (map `calories→kcal`, `protein_g→protein`, `carbs_g→carbs`, `fat_g→fat`; brand comes from nothing — omit it, the server folded it into `raw` which bootstrap doesn't return).
- `profile.bodyweight/fuelTargets/coach/device` → their respective states (falling back to current defaults when absent).

## 4. Writes through the API (server mode)
- Survey completion → `POST /api/checkins {day: iso(TODAY), score, answers}`.
- `addFuel` → `POST /api/fuel-logs {eaten_on: fuelDay, name, calories: Math.round(kcal), protein_g, carbs_g, fat_g, source:"custom"}` — use the returned row's `id` in state (protein-target speak logic unchanged). `deleteFuel` → `DELETE /api/fuel-logs/:id`.
- Bodyweight, fuelTargets, coach, device saves → `PATCH /api/profile` with just that key.

## 5. Export button (BOTH modes' code, but it reads localStorage — surface it in prototype mode's settings/profile area)
"Export my data" → gathers every `forge.readiness.*` key into `{checkins: {"<iso>": {score,answers}}}` plus `fuelLog`, `bodyweight` (number), `fuelTargets`, `coach`, `device` from their keys → downloads `workhart-export.json` shaped EXACTLY as the `POST /api/import` body (U3a ask §2).

## 6. Import flow (server mode)
After sign-in, when bootstrap shows zero checkins AND zero fuel rows, show an import card: file picker for the export JSON → `POST /api/import` → show `{imported: {checkins, fuel, skipped}}` counts → re-fetch bootstrap. On 409 show "This account already has data" and hide the card. A "skip — start fresh" dismiss stores `forge.importDismissed=1` (nicety flag, localStorage OK).

## 7. Droplet magic-link helper (unblocks sign-in while Resend is sandboxed)
`server/scripts/mint-link.js`: takes an email arg, looks up the user, inserts a magic_link_tokens row (same hashing/TTL as auth.js — import/reuse, don't duplicate constants), prints `https://alphaecho.io/api/auth/verify?token=<raw>`. Run ONLY on the droplet via `node --env-file=/etc/workhart/env scripts/mint-link.js <email>`; unknown email → exit 1. This prints a single-use 15-min link by design — that's acceptable; it must never print hashes, session tokens, or env values.

## 8. Deploy rail
`ops/deploy.sh` step 1 becomes `VITE_SERVER_MODE=1 npm run build` (that's the ONLY place the flag is ever set — grep-prove no other occurrence outside docs).

## Hard rules
- No new npm deps. Nothing under `server/` changes except the new `scripts/mint-link.js`. No commits.
- Prototype mode's behavior must be byte-for-byte the same experience (plus the Export button) — the mode gate must default OFF.
- For the green-light round-trip use a THROWAWAY user (`psql`-insert `hey+gl@blueroutevineyard.com`, role `user`) — do NOT import anything into `hey@blueroutevineyard.com` (Sam's real import must find an empty account later).

## Green-light (run each, report PASS/FAIL with actual output)
```
npm run build                                                                     # prototype-mode build passes
VITE_SERVER_MODE=1 npm run build                                                  # server-mode build passes
ssh workhart 'cd /srv/workhart/server && npm test'                                # all 21 tests still green (after deploy)
# prototype regression on dev :4890 (no flag): fake login → survey → app works; Export downloads a JSON matching the import shape (paste its top-level keys)
./ops/deploy.sh                                                                   # green end-to-end
curl -s https://alphaecho.io/ | grep -o 'VITE_SERVER_MODE' | head -1              # (sanity: no literal flag leaks; report what the login screen serves instead — fetch / and confirm it's the built app)
# live round-trip on alphaecho.io (browser or curl -c/-b cookie jar):
#   1. psql-insert throwaway user hey+gl@blueroutevineyard.com; mint-link on droplet; open link → lands signed in
#   2. POST a synthetic export (3 checkins, 2 fuel days) through the import UI/endpoint → counts correct
#   3. add a fuel entry + complete/POST today's checkin → psql: rows exist for the throwaway user only
#   4. reload → data still renders (bootstrap, not localStorage); sign out → sign-in screen
curl -s https://alphaecho.io/api/health                                           # still ok, db true
```
Report every line PASS/FAIL with actual output, then stop. Note for the report: real-email delivery is still blocked on Resend domain verification — the mint-link path is the sanctioned stand-in.
