# Ask 37 — U11: Sam's data cutover (LIVE runbook)

## Objective
Move Sam's real prototype data (check-ins, fuel log, profile) from workhart.netlify.app into his own alphaecho.io account. Prove it with exact counts, and prove the Netlify prototype was not touched. This closes M4's first success criterion: "Sam signs in at https://alphaecho.io, his full real history (imported) renders…".

**This unit has no code to build.** Every step is a live action by Sam or a live check by the chief of staff, so no builder is dispatched. If any step fails, stop and report; any code fix becomes its own ask.

## Measured facts (checked 2026-10-15; don't re-derive)
- **Netlify prod** (`origin/main` @ `b302788`, still `src/Forge.jsx`) already ships Settings → **"Export my data"**. It reads `forge.readiness.*`, `forge.fuelLog`, `forge.bodyweight`, `forge.fuelTargets`, `forge.coach` and `forge.device` from **that browser's localStorage**, and downloads a JSON blob `{checkins, fuelLog, bodyweight, fuelTargets, coach, device}`. No Netlify deploy is needed. Baseline: `https://workhart.netlify.app/` → **200**, entry bundle **`assets/index-D9PpLV6q.js`**.
- **Sam's data exists only in the browser(s) where he used the prototype.** He must export from that same browser and device.
- **Sam's alphaecho.io account** `hey@blueroutevineyard.com` (role `user`) currently has **0 checkins, 0 fuel_logs, 0 workout_logs** and profile `{}`. So after sign-in he lands on the one-time import screen (server mode shows it when the account has zero checkins and zero fuel).
- `POST /api/import` runs in one transaction. It returns `{imported:{checkins, fuel, skipped}, profile}`, and the UI prints "Imported N check-ins, M fuel entries[, skipped K]." Entries are skipped when: a check-in has a bad day, a score outside range, or non-object answers; a fuel day isn't an array; a fuel entry has no `name`. A second import returns **409**.
- Prototype workout history is mock data, so it is NOT imported (by design since U3a).
- Real email works: Resend sends from `login@mail.alphaecho.io` (domain verified 2026-09-10). This run is also the first real-inbox click-through of a magic link.
- **Privacy:** the blob is Sam's personal data. It goes in the chief of staff's scratchpad only, never in the repo, chat, logs or a commit. Report counts only, never contents.

## Runbook (every line LIVE — nothing runs without Sam's OK)
```
# 0. Pre-check (read-only)
curl -s -o /dev/null -w "%{http_code}\n" https://workhart.netlify.app/                     # LIVE — PASS: 200
curl -s https://workhart.netlify.app/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js'        # LIVE — PASS: assets/index-D9PpLV6q.js
ssh workhart "sudo -u postgres psql workhart -tAc \"SELECT (SELECT count(*) FROM checkins c WHERE c.user_id=u.id), (SELECT count(*) FROM fuel_logs f WHERE f.user_id=u.id) FROM users u WHERE email='hey@blueroutevineyard.com'\""   # LIVE — PASS: 0|0

# 1. SAM: in the browser where he used the prototype → workhart.netlify.app → Settings → "Export my data" → hand the .json file to the chief of staff (a path on disk)
# 2. CoS: count the blob (save it to the scratchpad first)
jq '.checkins | length' <blob>                                                             # LIVE — record C (expected check-ins)
jq '[.fuelLog[] | length] | add // 0' <blob>                                               # LIVE — record F (expected fuel entries)
jq 'keys' <blob>                                                                           # LIVE — PASS: exactly the 6 keys above

# 3. SAM: at https://alphaecho.io enter hey@blueroutevineyard.com → open the REAL email → click the link   # LIVE — PASS: lands signed in on the import screen
# 4. SAM: pick the exported file → Import                                                  # LIVE — PASS: UI reads "Imported C' check-ins, F' fuel entries[, skipped K]" with C'+F'+K accounting for C and F
# 5. CoS: psql counts for Sam
ssh workhart "sudo -u postgres psql workhart -tAc \"SELECT (SELECT count(*) FROM checkins c WHERE c.user_id=u.id), (SELECT count(*) FROM fuel_logs f WHERE f.user_id=u.id) FROM users u WHERE email='hey@blueroutevineyard.com'\""   # LIVE — PASS: C'|F' (equal to the UI numbers; C'==C and F'==F when skipped is 0)
# 6. SAM: reload alphaecho.io                                                              # LIVE — PASS: no import screen; readiness trend shows the imported days; Fuel shows the imported entries on their days
# 7. Netlify untouched
curl -s -o /dev/null -w "%{http_code}\n" https://workhart.netlify.app/                     # LIVE — PASS: 200
curl -s https://workhart.netlify.app/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js'        # LIVE — PASS: still assets/index-D9PpLV6q.js
curl -s https://alphaecho.io/api/health                                                    # LIVE — PASS: ok true, db true
```

## Hard rules
- No code changes, no deploys (alphaecho.io or Netlify), no pushes to `main`.
- Never print or store the blob's contents outside the scratchpad. Report counts only.
- Don't import for Sam with a minted link or a script. The point is Sam signing in through the real email, in his own browser.
- If skipped > 0, report which category was skipped (by counting with jq), not the entries.
- If step 4 returns 409 or an error: stop. Don't delete Sam's rows to retry without his explicit OK.
