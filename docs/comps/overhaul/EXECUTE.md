# Overhaul — EXECUTE

The complete prompt for the session that runs the overhaul overnight. Read `SPEC.md` first (binding), then this file. This is the PLAN and the AUDIT as well: §2 is how every unit runs, §3 the exact gate, §4 the measured premises, §5 the ship step, §6 the morning report.

Start phrase (Sam): **"read docs/comps/overhaul/EXECUTE.md and execute it"**. Use the `chief-of-staff` skill's loop for the dispatch; this file supplies what that skill asks for.

## 0. Read the picks first

Before W.0, read the board store: `ArtifactData` `get` on the artifact `WORKHART Overhaul` (URL in the memory note `forge-fitness-app`), collection `picks`, doc `workhart-overhaul1`. For each of q1 to q8: a stored pick is the ruling; no stored pick means the board's recommended option (SPEC §0 lists them). Write the eight resolved values and their source (`store` or `default`) at the top of `GATES.md` before anything else runs. A pick that contradicts a SPEC decision (for example q1 = B) changes the unit it touches; W.6's tokens follow the pick. Do not re-ask.

## 1. Authority for this run (granted by Sam, 2026-10-21; never re-ask per step)

- Build **W.0 → W.1 → W.2 → W.3 → W.4 → W.5 → W.6 → W.7 → W.8 → W.9 → W.10 → W.11** on branch `overhaul` (off `main`), one commit per green unit, short imperative subjects, explicit paths staged (never `git add -A`; `.impeccable/`, `docs/comps/` other than this round and any stray scratch stay out).
- After each green unit: fast-forward `main` to `overhaul`, push `origin main`, run `./ops/deploy.sh` from `/Users/sm-pro/Projects/workhart`, read production back (§5). Netlify builds `prototype`, not `main`, from W.0 on; confirm that before the first `main` push after W.0.
- A deploy runs the migrations (`ops/deploy.sh` step 4). Every migration in this round is additive. Before W.1's deploy take a one-off dump on the droplet: `ssh workhart 'sudo -u postgres pg_dump workhart | gzip > /var/backups/workhart-pre-overhaul-$(date +%F).sql.gz'` and record its size.
- Never read a secret; never print any part of a key; never force-push; never touch `/etc/workhart/env` except to read a key's presence with `grep -c '^KEY=.'`.
- The Kyle voice recipe, the one-voice allowlist and the no-`speechSynthesis` rule are never relaxed to pass a gate.
- **Stop rules.** A unit that fails its gate twice restarts once with an Opus builder on the same ask. A third failure stops the run: leave `overhaul` on its green commits, write the state into `docs/PRD.md`, `GATES.md` and the memory note, do not ship past the last green unit. A failed production read-back → `git revert` the fast-forwarded commits on `main`, push, redeploy, stop.
- **Facts settled; do not relitigate:** SPEC §0 (r1 to r4, q1 to q8 as resolved in §0 above), the decisions in SPEC §0.1, the research facts (Google Fit, Apple Health, MyFitnessPal, Stripe wallets), the unit order, the night-two list.

## 2. How each unit runs (the PLAN)

1. **Write the ask** in `docs/asks/W<n>-<slug>.md` (numbering continues the existing `docs/asks/NN-*.md` series in spirit; the W prefix keeps the round findable): self-contained, SPEC's unit row plus the §0.1 decisions and §2 to §3 contract lines it touches restated with exact files, routes, table columns and test names; the constraints with teeth (hard rules, scoping, idempotency); the green-light block (§3) with the unit's own lines added; "Build ONLY this unit. Run the green-light. Report PASS/FAIL with real output and stop. Never commit." For UI units the ask names the look (q1) and the frame on the board the screen must match, and tells the builder to load `impeccable` and `ui-ux-pro-max` before writing UI.
2. **Dispatch one fresh builder** (Agent tool, `general-purpose`; model per SPEC §1: `sonnet`, `opus` for W.6) with: the ask path, "read `CLAUDE.md` and `docs/comps/overhaul/SPEC.md` first", "work in `/Users/sm-pro/Projects/workhart` on branch `overhaul`", the test recipe from §3, "never commit, never deploy, never touch another unit, never start a dev server on a port other than 4890". One builder at a time; nothing else runs tests in this checkout while it works.
3. **Re-gate independently** (§3) on the exact tree the builder left. Read the security-critical code of the unit before committing: every new route's scoping, every new table's FKs, the email ledger, the coach-line prompt's data guard.
4. **Hygiene**: `CLAUDE.md` "Current position" and `docs/PRD.md` updated in the same commit; no history, counts or dates in code comments; comments ALL CAPS on their own line above the code (the repo's convention is sentence case today; new comments follow the dev-principles house style).
5. **Commit** the unit (explicit paths), then §5. Append the gate output to `docs/comps/overhaul/GATES.md` (this run's log; deleted in W.11 after salvage).
6. **Seen running** is satisfied by the live read-back in §5 and, for UI units, by the Chrome-driven walk of the screens on alphaecho.io as the test client `hey+gl@blueroutevineyard.com` (mint a link with `server/scripts/mint-link.js` on the droplet if the inbox is not reachable). Sam's own account is never used and never written to.

## 3. The gate (every unit; the ask adds its own lines)

```
# server (scratch DB; migrate first; both runs must print the same pass count)
cd server && TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod node node_modules/.bin/node-pg-migrate up -d TEST_DATABASE_URL
cd server && TEST_DATABASE_URL=postgres:///workhart_scratch_test DATABASE_URL=postgres:///workhart_nonexistent_prod NODE_ENV=test node --test --test-reporter=tap test/*.test.js 2>&1 | grep -E "^# (tests|pass|fail)"
# a migration unit: up is a no-op the second time, then down one and up again
# frontend
npm run build 2>&1 | tail -2
node --test src/*.test.js 2>&1 | grep -E "^# (tests|pass|fail)"      # from W.6 on
grep -rn "speechSynthesis" src server --include=*.js --include=*.jsx | grep -v node_modules   # must print nothing
node ~/.claude/skills/impeccable/scripts/detect.mjs --json src        # UI units: [] or triaged
# security
grep -n "req.body.user_id\|req.query.user_id\|req.params.user_id" server/*.js   # must print nothing new
```
Baseline before W.1: **68 tests pass**, build passes (measured 2026-10-21). Read test output in both directions: the `# fail 0` line is the pass, not the exit code.

## 4. Audit of the premises (measured 2026-10-21 before the run)

| Premise | Measured |
|---|---|
| Checkout | `/Users/sm-pro/Projects/workhart`, branch `main` = `origin/main` = `b302788`; uncommitted green work from U9/U10/U10b (rename to `src/Workhart.jsx`, `server/password.js`, migration `1789500000000_user-password.sql`, tests, asks 35 to 38, `src/history.js`); W.0 commits it |
| Node | Mac `v26.0.0`, no `.nvmrc`; droplet runs Node 22; tests and build pass on 26 |
| Scratch DB | `workhart_scratch_test` exists, migrated to `1789500000000`; Postgres accepting on 5432 |
| Tests | 68/68 with the §3 recipe; the `test` script in `server/package.json` names every file (append new files there) |
| Build | `npm run build` passes (chunk-size warning only) |
| Droplet | `ssh workhart` BatchMode ok; `/srv/workhart` (web/ + server/); `workhart-api` active; `https://alphaecho.io/api/health` → `{"ok":true,"db":true}`; `pgmigrations` max = `1789500000000_user-password`; users: 1 admin, 4 clients; 5 workout logs; 4 messages |
| Deploy | `ops/deploy.sh`: build with `VITE_SERVER_MODE=1` (W.6 removes the flag and the script line), rsync `dist/` and `server/`, remote `npm ci --omit=dev`, `migrate:up`, restart; health check at the end |
| Netlify | site `workhart` (`13ddab10-931d-47ba-9cf0-f1e2b20cb228`), `repo_branch: main` today; CLI authed on this Mac; W.0 re-points it to `prototype` with `npx netlify-cli api updateSite --data '{"site_id":"13ddab10-931d-47ba-9cf0-f1e2b20cb228","body":{"repo":{"branch":"prototype"}}}'` and confirms one deploy from that branch |
| Fonts | Google Fonts link in `src/Workhart.jsx` (Barlow Condensed + Space Grotesk); W.6 moves it to `index.html` as Barlow Condensed + Barlow |
| Voice | `server/media.js` + `media-lib.js` hold the recipe and the allowlist; `/api/tts` 60/h per user; `src/Workhart.jsx` `speak`/`speechify` are the client half |
| AI | `server/ai.js`: `generateDraft`, `generateFromContext`, `SYSTEM_PROMPT`, test seam `calls`/`testControls`; model `claude-sonnet-5`; `ANTHROPIC_API_KEY` present on the droplet (`grep -c` 1) |
| Mail | `server/mail.js` origin-pinned Resend, `outbox` test seam; `MAIL_FROM` = `WORKHART <login@mail.alphaecho.io>` |
| Jobs | `server/jobs.js` + `scheduler.js` (pg-boss v12, named import; scheduler only from `index.js`, never under test); `job_runs` claim-first pattern to copy for `unread-nudge` |
| Routes | 33 mounted routes (inventory in `server/test/idor.test.js` `MATRIX`, which asserts its own length — every new route is appended there) |
| Admin scoping today | `admin.js` filters nothing by trainer (one admin exists); W.1 adds the filter everywhere |
| Design detector | `.impeccable/config.json` carries the Space Grotesk ignore-value (W.6 deletes it) and five board-only contrast ignores added this session |
| Last migration number | `1789500000000` → this round claims `1790100000000` to `1790500000000` |

## 5. Ship step (after every green unit)

1. `git checkout main && git merge --ff-only overhaul && git push origin main && git checkout overhaul`.
2. `./ops/deploy.sh` from the repo root; read the log: build, rsync, `npm ci`, migrate (names the files it applied), restart, health.
3. Read back: `curl -s https://alphaecho.io/api/health`; `ssh workhart 'systemctl is-active workhart-api; psql "$(sudo -n grep ^DATABASE_URL= /etc/workhart/env | cut -d= -f2-)" -tAc "select max(name) from pgmigrations"'`; for UI units open alphaecho.io in Chrome as the test client and walk the unit's acceptance line from SPEC §5.
4. Write the result to `GATES.md`.

## 6. Morning report

When the run ends (complete or stopped): `docs/PRD.md` has a "Milestone W" table with each unit's state; `CLAUDE.md` "Current position" names the last green unit and the next; `docs/loose-ends.md` is created from SPEC §7 plus everything the run left open; `GATES.md` holds every gate and every read-back; the auto-memory note `forge-fitness-app` says where things stand and what Sam looks at first (install on the phone, run a session, hear Kyle; add a client from the console, build a program, enrol, compose and send).
