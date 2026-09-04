# Ask 31 — U5b: Kyle console UI + assigned workouts in the athlete app

## Objective
Two halves, both server-mode-only (prototype mode stays byte-identical — every change gated on `SERVER_MODE` or admin role):
1. **Console:** an admin who signs in lands in a Kyle console (not the athlete tabs): roster → per-user dashboard → workout builder from `EX_LIB` → assign to a user + date.
2. **Athlete:** assigned workouts replace the mock schedule as the source of "Today's session" — the calendar marks assigned days, the Today card shows the real assignment, Start workout runs the EXISTING engine off the assigned blocks, and the finished session POSTs to `/api/workout-logs` (marking the assignment completed).

Read `CLAUDE.md` first; hard rules apply (no speechSynthesis, never print secrets, commit nothing, no deletes). Match the file's existing style exactly: one component file, inline styles, `C` tokens, `Sheet` pattern, Space Grotesk `ff-d` headers.

## Measured facts (don't re-derive)
- `EX_LIB` (Forge.jsx:98): 50 entries `{name, equipment, muscles, base, video, blurb, cues}`. There is no key field — **the `exercise_key` convention IS the exact `EX_LIB` name string** (e.g. `"Barbell Bench Press"`). Console writes it; athlete maps it back to EX_LIB by name for cues/videos (fall back gracefully when a key has no EX_LIB match).
- Blocks jsonb: `[{exercise_key, sets: [{reps, weight_lbs?, rpe?}], rest_sec?, note?}]`.
- Admin API (ask 30, all live): `GET /api/admin/users` (roster + last_checkin/assignment_count), `GET /api/admin/users/:id/overview`, `POST /api/admin/workouts {title,notes?,blocks}`, `GET /api/admin/workouts`, `POST /api/admin/assignments {user_id,workout_id,scheduled_for}` (409 dupe), `PATCH /api/admin/assignments/:id {status}` (assigned|skipped only).
- Bootstrap already returns `assignments` (scheduled_for ≥ today−7, asc): `{id, scheduled_for, status, workout:{id,title,notes,blocks}}`. **Gotcha: `scheduled_for` and `last_checkin` arrive as full timestamps (`"2026-09-05T00:00:00.000Z"`) — always `slice(0,10)` to compare with `iso()` days.**
- Engine anchors: mock `workout` const at :61 (`{name, duration, focus, exercises:[{name, sets:n, reps:"6–8", load:"185 lb", cues, note?}]}`); engine reads the module-level `workout` in `start` (:1112), grid init (:893), `checkRow` (:1145, log entries `{i, w, reps}`), `finish` (:1121, computes sets/volume/minutes). `setRest(90)` hardcoded in checkRow. Post-workout RPE state exists (`rpe`).
- Seed data on alphaecho: workout "Fable Verify Day" (bench 5×135/5×155, rest 120) assigned to `hey+gl@blueroutevineyard.com` for 2026-09-05 — use it before creating more.
- Sign-in for verification: `ssh workhart 'cd /srv/workhart/server && node --env-file=/etc/workhart/env scripts/mint-link.js <email>'`.

## 1. Small backend addition (server/data.js — the ONLY server change)
`POST /api/workout-logs`: when `assignment_id` is present, also `UPDATE workout_assignments SET status='completed' WHERE id=$1 AND user_id=$2` inside the SAME transaction. Extend one existing test (or add one) proving status flips; the cross-user-assignment 400 test must still pass.

## 2. Athlete: assigned workouts drive the session (server mode only)
- Replace the engine's read of the module-level `workout` with a component-level `activeWorkout` that defaults to the mock (prototype mode identical). In server mode, derive the selected day's session from `assignments` (`scheduled_for.slice(0,10) === iso(selectedDay)`, status not `skipped`).
- Map blocks → engine shape: exercise per block = `{name: exercise_key, sets: block.sets.length, reps: String(max reps), load: `${first weight_lbs} lb` or "Bodyweight" when absent, cues: EX_LIB match ?? [], note: block.note}`, PLUS `setRows: block.sets.map(s => ({reps: s.reps, w: s.weight_lbs ?? 0, done:false}))` — grid init uses `ex.setRows` when present instead of the parseReps/parseWeight fill. Rest between sets uses `block.rest_sec ?? 90`.
- Today card + calendar in server mode: assigned day → dot + the workout's title/exercise count; day without assignment → a quiet "No session assigned" card (no Start button); `doneToday`/completed assignment day → the existing done treatment.
- `finish()` in server mode: POST `/api/workout-logs` `{performed_at: new Date().toISOString(), assignment_id, notes: rpe ? `Session RPE: ${rpe}` : undefined, sets: [...]}` where sets carry `{exercise_key, set_no (1-based per exercise), reps, weight_lbs}` built from the engine log + activeWorkout. On failure: keep the summary UI but show the existing inline write-error style; do NOT retry-loop.
- Mock strings that say "Push Day A" in speak lines (:1117 area) use `activeWorkout.name` (already parameterized after the rename — verify).

## 3. Console (admin role, server mode)
When `serverUser.role === "admin"` after sign-in, render the console INSTEAD of the athlete tabs (Kyle doesn't train here; sign-out stays available):
- **Roster screen:** users (skip admins) with name, email, last check-in day, assignment count. Click → dashboard.
- **User dashboard:** fetch overview → readiness trend (reuse the existing chart pattern/tokens; checkins day-asc), recent workout logs (title/date/set count from nested sets), recent fuel (day totals are enough), upcoming assignments with status. Back to roster.
- **Workout builder** (from the dashboard, "Assign a workout"): EITHER pick an existing workout from `GET /api/admin/workouts` OR build new: title; add exercises via EX_LIB search (reuse the existing library search UI pattern); per exercise: rows of sets (reps + weight, add/remove row — reuse the set-grid interaction style), rest seconds, optional note; then a date (default tomorrow) → `POST /api/admin/workouts` (when new) + `POST /api/admin/assignments`. 409 duplicate → inline "already assigned that day". Success → back to dashboard showing the new assignment.
- Keep it lean: no edit/delete of workouts or assignments this unit (PATCH-to-skipped can wait), no pagination.

## Hard rules
- Prototype mode byte-identical (mode gate audit: every new UI/behavior behind `SERVER_MODE`, console additionally behind role check). `npm run build` without the flag must produce the current behavior.
- No new npm deps. No changes under `netlify/`, nginx, systemd; server change limited to §1.
- Voice: only the existing `speak()` path — no new TTS surfaces in the console.

## Green-light (run each, report PASS/FAIL with actual output)
```
npm run build && VITE_SERVER_MODE=1 npm run build        # both pass
ssh workhart 'cd /srv/workhart/server && npm test'       # all suites pass (32 + the §1 coverage) — report counts
./ops/deploy.sh                                          # green end-to-end
# Live, in the browser on alphaecho.io (report each step with what you saw):
#  1. Sign in as hey+kyle → console roster (3 users minus admins = 2), GL Throwaway shows a last check-in
#  2. Open GL Throwaway's dashboard → readiness trend renders from real checkins, "Fable Verify Day" visible in assignments
#  3. Build a NEW workout (2 exercises from EX_LIB, custom sets) → assign to GL Throwaway for TODAY → success
#  4. Sign out, sign in as hey+gl → Today card shows the new workout title; calendar dots today
#  5. Start workout → per-set rows match what Kyle built → check all sets through finish
#  6. psql: workout_logs row + workout_log_sets rows for hey+gl match the session; assignment status = 'completed'
#  7. Reload → Today card shows the done state
curl -s https://alphaecho.io/api/health                  # still ok, db true
# Prototype regression (:4890 or preview, NO flag): fake login → survey → app → mock Push Day A engine unchanged
```
Report every line PASS/FAIL with actual output, then stop.
