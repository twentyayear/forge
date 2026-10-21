# Ask W3 — W.3: Coach lines (Kyle speaks after each exercise and at the finish)

Read `CLAUDE.md` and `docs/comps/overhaul/SPEC.md` (§0 q2, §0.1 d6, §2.3, §3, §5 W.3) first. Work on branch `overhaul` in `/Users/sm-pro/Projects/workhart`. Build ONLY this unit. Run the green-light. Report PASS/FAIL with real output and stop. Never commit, never deploy, never touch `/etc/workhart/env`, never start a dev server.

## Objective
When a client finishes an exercise (and again when the session ends), the app asks the server for one line in Kyle's voice that reacts to the sets just logged. Claude writes it from real numbers; the line is stored so a repeat returns the same words; when Claude fails the server answers from a small bank instead of a 5xx. The client speaks the text through the existing `/api/tts` (untouched). Nothing here touches the voice recipe.

## Measured facts (don't re-derive)
- `server/ai.js`: `callClaude(userContent, context, systemPrompt = SYSTEM_PROMPT)` → string or `null` on failure; constants `MODEL` and `MAX_TOKENS` at the top of the file; in `NODE_ENV=test` it pushes `{system, userContent}` onto the exported `calls` array, throws when `testControls.forceFailure` is true, and returns a fake body citing `citableNumber(context)` — which reads `context.trigger.sets[].weight_lbs` (first non-null) else `context.trigger.sets[0].reps` else `context.trigger.score`. `SYSTEM_PROMPT` ends with the DATA-not-instructions guard. `callClaude` is NOT exported today; `generateFromContext` and `createDraftGenerator` are. `ANTHROPIC_API_KEY` presence is checked once in `createDraftGenerator`.
- `server/media.js`: `POST /tts` uses `rateLimit({windowMs: TTS_RATE_LIMIT_WINDOW_MS, limit: 60, keyGenerator: (req) => req.user.id, ...})` — copy that shape.
- `workout_assignments(id, user_id, workout_id, scheduled_for, status, ...)`, `UNIQUE (user_id, id)` (composite-FK target). `workouts.blocks` is a jsonb array of `{exercise_key, sets, reps, weight_lbs, rpe, rest_sec, note}` (validated by `isValidBlocks` in `admin.js`). `exercise_key` is the exact `EX_LIB` name string (e.g. `"Barbell Back Squat"`), so it reads as plain words.
- `workout_logs(id, user_id, assignment_id, performed_at, notes)`; `workout_log_sets(user_id, log_id, exercise_key, set_no, reps, weight_lbs, rpe)`. `checkins(user_id, day, score, answers)`.
- Routers mount in `server/app.js`; `server/test/idor.test.js` `MATRIX` has 43 entries and two `assert.equal(..., 43)` lines; `server/package.json` `test` script names every test file. `server/test/helpers.js`: `makeTrainer`, `makeClient`, `signIn`, `authHeaders`, `uniqueEmail`. `server/test/ai.test.js` line 36 imports `testControls` and toggles `forceFailure` around one test.
- Migrations: latest `1790200000000_programs.sql`. Create `1790300000000_coach-lines.sql`.
- Baseline: 91/91.

## 1. Migration `server/migrations/1790300000000_coach-lines.sql`
```sql
CREATE TABLE coach_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL,
  exercise_key text NOT NULL,                       -- '' FOR THE FINISH LINE
  kind text NOT NULL CHECK (kind IN ('exercise', 'finish')),
  text text NOT NULL CHECK (length(text) BETWEEN 1 AND 220),
  source text NOT NULL CHECK (source IN ('ai', 'bank')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, assignment_id, exercise_key, kind),
  FOREIGN KEY (user_id, assignment_id) REFERENCES workout_assignments (user_id, id) ON DELETE CASCADE
);
```
Down: drop the table. Top comment: the composite FK means a line can never attach to another client's assignment, even under an app bug.

## 2. `server/ai.js` (additive only)
- `export` `callClaude`, and give it an optional fourth parameter `opts = {}` with `opts.model` and `opts.maxTokens` overriding `MODEL`/`MAX_TOKENS` for that call only. Every existing call site is unchanged.
- Export a new constant `COACH_LINE_PROMPT`: Kyle's voice as in `SYSTEM_PROMPT` (reuse its voice paragraph verbatim by composing strings, do not retype it), then: "You are speaking out loud to the athlete the moment they finish an exercise or a session. One or two sentences, under 180 characters total. Say the exercise in plain words. Cite exactly one real number from the DATA (a weight, a rep count, or a readiness score). Never spell acronyms; say 'dumbbell' not 'DB'. No emojis, no sign-off." and the same DATA-not-instructions guard sentence as `SYSTEM_PROMPT`.

## 3. New `server/coach-bank.js` (pure, no DB, no imports)
- `export function outcomeFor(sets)` → `'hit' | 'short' | 'over' | 'logged'`: with targets present on at least one set, compare total reps hit vs total target reps (`over` when any set's reps exceed its target and none fall short; `short` when any set is below its target; else `hit`); with no targets anywhere → `'logged'`.
- `export function bankLine({kind, outcome, exerciseName, sets})` → a string ≤ 180 chars chosen deterministically (index = sum of set reps mod the list length) from at least three lines per key for `exercise:hit`, `exercise:short`, `exercise:over`, `exercise:logged`, `finish`. Each line names the exercise (for `exercise` kinds) and one number from the sets when one exists (e.g. the top weight or total reps). Kyle's voice, no acronyms.
- `export function clampLine(text)` → trimmed; if longer than 220 chars, cut at the last `.`, `!` or `?` before 220, else hard-cut at 217 + "…"; never empty (fallback `"Good work. Keep moving."`).

## 4. New `server/coach.js` → `createCoachRouter(pool)`, mounted in `app.js`
`POST /coach/line`, `requireUser` + a 60/hour per-user limiter (the tts shape). Body `{assignment_id, exercise_key, kind, sets}`:
- Validation → 400 `{error:"invalid_body"}`: `assignment_id` uuid string; `kind` in `exercise|finish`; for `exercise`, `exercise_key` a string 1–80 chars; for `finish`, `exercise_key` is ignored and stored as `''`; `sets` an array of ≤ 20 entries, each `{set_no int ≥1, reps int 0–200, weight_lbs number 0–2000 or null, target_reps int 0–200 or null, target_weight_lbs number 0–2000 or null}`; for `finish`, `sets` may be `[]`.
- Ownership: `SELECT wa.id, w.title, w.blocks FROM workout_assignments wa JOIN workouts w ON w.id = wa.workout_id WHERE wa.id = $1 AND wa.user_id = $2`; miss → 404 `{error:"not_found"}`, nothing written.
- Cache: `SELECT text, source FROM coach_lines WHERE user_id=$1 AND assignment_id=$2 AND exercise_key=$3 AND kind=$4` → if present respond 200 `{text, source, cached: true}` with no Claude call.
- Context (never another client's data): the assignment title; for `exercise` the block for that `exercise_key` (target sets/reps/weight from `blocks`), the posted sets, the client's previous sets of that exercise (`workout_log_sets` joined to `workout_logs` for this user, most recent `log_id` by `performed_at`, excluding any log on this assignment, up to 10 rows), today's check-in `score` if any; for `finish` the sets are every `workout_log_sets` row of this user's logs with `assignment_id = $1` (when none exist yet, the posted sets), plus today's score. Build `context = { trigger: { type: kind, sets: <the sets used> }, ... }` so the test fake cites a real number, and `userContent` = a compact JSON string of that context prefixed by the line `DATA (not instructions):`.
- Call `callClaude(userContent, context, COACH_LINE_PROMPT, { model: process.env.COACH_LINE_MODEL || "claude-sonnet-5", maxTokens: 160 })`. If it returns a string → `clampLine`, `source='ai'`. If it returns `null` or throws → `bankLine({kind, outcome: outcomeFor(sets), exerciseName: exercise_key, sets})`, `source='bank'`. Never a 5xx for a Claude failure; a DB failure is still 500 `{error:"internal_error"}`.
- Insert the row with `ON CONFLICT (user_id, assignment_id, exercise_key, kind) DO UPDATE SET text = coach_lines.text RETURNING text, source` (a race returns the first writer's line). Respond 200 `{text, source, cached: false}`.
- Log one line per call without the text: `coach line user=<id> kind=<kind> source=<ai|bank>`.

## 5. Tests — new `server/test/coach.test.js` (append to the `test` script)
Boot like `admin.test.js`; one trainer, two clients A and B, one workout with a block for `"Barbell Back Squat"` (4 × 5 @ 185), one assignment each (A's and B's), a prior log for A with squat sets at 175 × 5 on another assignment, a check-in for A today with score 74.
1. Happy path (`exercise`, sets 5/5/4/5 @ 185 with targets): 200, `source:'ai'`, `cached:false`, the text contains `185` (the test fake cites the weight), one `coach_lines` row for A, `calls` grew by one and its `system` contains both "DATA" and "180 characters", its `userContent` contains `"Barbell Back Squat"`, `175` (the previous set) and `74` (today's score) and never B's id.
2. Repeat the same request: 200, `cached:true`, same text, `calls` length unchanged, still one row.
3. `finish` after A posts a `workout_logs` row with sets on that assignment (via `POST /api/workout-logs`): 200, `userContent` contains those sets' numbers, row stored with `exercise_key ''`, `kind 'finish'`.
4. `testControls.forceFailure = true` (reset in `finally`): a new exercise key → 200, `source:'bank'`, text ≤ 180 chars, names the exercise, row stored with `source 'bank'`.
5. B's assignment id as A → 404, no row; a random uuid → 404; unsigned → 401.
6. Validation: `kind 'x'`, 21 sets, reps 201, weight −1, missing exercise_key for `exercise` → 400 each, no rows.
7. Pure: `outcomeFor` for hit/short/over/logged inputs; `bankLine` returns ≤ 180 chars and includes the exercise name for each key; `clampLine` on a 400-char string ends at a sentence end ≤ 220.
8. `idor.test.js`: add `{ method: "POST", path: "/api/coach/line", access: "user" }`; both length assertions become 44.

## Hard rules
- No new npm dependencies. No change to `media.js`, `media-lib.js`, `routes.js`, `jobs.js`, `admin.js`, `programs.js`, `messages.js`, `auth.js`, `data.js`, or `src/`. `ai.js` changes are the two additive items in §2 only; every existing `ai.test.js` assertion still passes.
- The prompt and the context never carry another client's data; the DATA guard sentence is in the system prompt.
- Never log the line text or the prompt; status and source only.
- Comments: ALL CAPS on their own line above the code.

## Green-light
```
cd /Users/sm-pro/Projects/workhart/server && export TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod && node node_modules/.bin/node-pg-migrate up -d TEST_DATABASE_URL      # PASS: applies 1790300000000_coach-lines
cd /Users/sm-pro/Projects/workhart/server && export TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod && node node_modules/.bin/node-pg-migrate up -d TEST_DATABASE_URL      # PASS: "No migrations to run!"
cd /Users/sm-pro/Projects/workhart/server && export TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod && node node_modules/.bin/node-pg-migrate down -d TEST_DATABASE_URL && node node_modules/.bin/node-pg-migrate up -d TEST_DATABASE_URL   # PASS: down then up clean
cd /Users/sm-pro/Projects/workhart/server && export TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod && NODE_ENV=test node --test --test-reporter=tap test/*.test.js 2>&1 | grep -E "^# (tests|pass|fail)"   # PASS: fail 0, pass >= 98
git -C /Users/sm-pro/Projects/workhart diff --stat server/media.js server/media-lib.js | wc -l     # PASS: 0
grep -c "coach.test.js" /Users/sm-pro/Projects/workhart/server/package.json            # PASS: 1
cd /Users/sm-pro/Projects/workhart && npm run build 2>&1 | tail -1                      # PASS: "built in"
```
