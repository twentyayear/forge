# Ask 27 — U3a: Server data API + history import (backend only)

## Objective
The user-data endpoints the app will run on: bootstrap read, scoped writes for checkins/fuel/workout-logs/profile, and a one-shot import endpoint for a user's prototype localStorage dump. Backend only — `src/` untouched (ask 28 wires the frontend). Read `CLAUDE.md` first; hard rules apply (never print secrets, commit nothing). Copy the scoping pattern from `server/routes.js` (ask 26): user id ALWAYS from `req.user.id`, never from the request.

## Prototype data shapes you're importing (measured from Forge.jsx — don't re-derive)
- `forge.readiness.<YYYY-MM-DD>` = `{score: 0-100, answers: {hours,sleep,soreness,energy,stress,fuel,drive: 0-3}}` (older entries may have a different answers shape — store whatever jsonb arrives)
- `forge.fuelLog` = `{ "<YYYY-MM-DD>": [{id, name, brand?, kcal, protein, carbs, fat}, ...], ... }`
- `forge.bodyweight` = number (lbs); `forge.fuelTargets` = `{protein, kcal}`-ish object; `forge.coach` and `forge.device` = strings.
- Real workout logs do NOT exist in the prototype (its schedule is mock data) — nothing to import there.

## 1. Routes (all in `server/routes.js` or a new `server/data.js` mounted like routes.js; all requireUser)
- `GET /api/bootstrap` → `{user: {id,email,name,role}, profile, checkins: [{day,score,answers}] (all, day asc), fuel: [{id,eaten_on,name,calories,protein_g,carbs_g,fat_g,source}] (all, eaten_on asc), workoutLogs: [{id,performed_at,notes,assignment_id, sets:[{exercise_key,set_no,reps,weight_lbs,rpe}]}] (all, performed_at asc)}`. One query per table (sets joined or one extra query) — no N+1.
- `POST /api/checkins` `{day, score, answers}` → upsert on `(user_id, day)` (`ON CONFLICT DO UPDATE` score/answers/updated_at). Validate: day is YYYY-MM-DD, score int 0–100, answers is an object. Returns the row.
- `POST /api/fuel-logs` `{eaten_on, name, calories, protein_g, carbs_g, fat_g, source, raw?}` → insert, validate per schema CHECKs (400 on violation, generic message). Returns the row (frontend needs the id).
- `DELETE /api/fuel-logs/:id` → `DELETE ... WHERE id=$1 AND user_id=$2`; 404 when no row (whether nonexistent or another user's — indistinguishable).
- `POST /api/workout-logs` `{performed_at, notes?, assignment_id?, sets: [{exercise_key,set_no,reps,weight_lbs?,rpe?}]}` → single transaction: insert log + all sets; any failure rolls back everything. If assignment_id present it must belong to the session user (the composite FK enforces it — surface as 400). Returns log + sets.
- `PATCH /api/profile` `{...fields}` → shallow-merge into `users.profile` jsonb (`profile || $1`), whitelist keys `bodyweight, fuelTargets, coach, device` (reject others with 400). Returns updated profile.

## 2. `POST /api/import` (requireUser; the one-shot prototype migration)
Body: `{checkins?: {"<iso>": {score,answers}}, fuelLog?: {"<iso>": [entries]}, bodyweight?, fuelTargets?, coach?, device?}` (the shapes above, keys optional).
- **Refuse a second import:** if the user already has ANY checkins or fuel_logs rows → `409 {error:"account already has data"}`. Import is into an empty account only — this is the idempotency story (no dedupe heuristics).
- One transaction: insert all checkins (skip malformed days/scores, count them), insert all fuel entries (map `kcal→calories`, `protein→protein_g`, `carbs→carbs_g`, `fat→fat_g`, ints via Math.round, source `'custom'`, brand folded into `raw` jsonb `{brand}` when present), merge profile fields (same whitelist). Any DB error → full rollback, 400.
- Response: `{imported: {checkins: n, fuel: n, skipped: n}, profile}`.
- Body size: raise express json limit to 2mb for this route only.

## 3. Tests (`server/test/data.test.js`, node:test, same guards/boot pattern as auth.test.js)
1. bootstrap returns exactly the session user's data (seed two users with rows; assert no cross-leak, shape matches spec).
2. checkin POST twice same day → one row, second wins (upsert).
3. fuel insert + DELETE own row (200/404-on-repeat); DELETE other user's row id → 404, row survives.
4. workout-log transaction: one bad set (set_no 0 violates CHECK) → 400, log row NOT inserted.
5. workout-log with another user's assignment_id → 400 (composite FK), nothing inserted.
6. profile PATCH merges (set bodyweight, then coach — both present after) and rejects unknown keys.
7. import happy path with a realistic dump (3 checkin days, 2 fuel days incl. brand + missing macros) → counts correct, rows correct, kcal mapped, profile merged.
8. import into an account with existing data → 409, nothing changed.
9. All routes 401 without a session.

## Hard rules
- Backend only: nothing under `src/`, `index.html`, `vite.config.js` changes.
- Production DB touched only by `migrate:up`/`seed` — live green-light curls stay unauthenticated (401 checks); authenticated behavior is proven by the test suite against `workhart_test`.
- No new npm deps. No commits. Update CLAUDE.md/PRD position at green.

## Green-light (run each, report PASS/FAIL with actual output)
```
ssh workhart 'cd /srv/workhart/server && npm run migrate:up:test && npm test'    # all suites (schema+auth+data) pass — report the counts
./ops/deploy.sh                                                                  # green end-to-end
for p in bootstrap checkins fuel-logs workout-logs profile import; do curl -s -o /dev/null -w "$p:%{http_code} " https://alphaecho.io/api/$p; done; echo   # every one 401 (GET; POST-only routes may 401 or 404 on GET — report what you see and confirm 401 via POST for those)
curl -s -X POST https://alphaecho.io/api/import -H 'content-type: application/json' -d '{}' -o /dev/null -w "%{http_code}\n"   # 401
curl -s https://alphaecho.io/api/health                                          # still ok, db true
```
Report every line PASS/FAIL with actual output, then stop.
