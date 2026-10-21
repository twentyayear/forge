# Overhaul — GATES (this run's log; deleted in W.11 after salvage)

## Picks (read from the board store `picks/workhart-overhaul1`, version 9, 2026-10-21 15:07 UTC)

| q | pick | source |
|---|---|---|
| q1 look | a Scoreboard | store |
| q2 Kyle speaks | a after each exercise + finish | store |
| q3 free vs plan | a coaching is the plan | store |
| q4 wearables | a Oura/Whoop/Garmin OAuth (night two) | store |
| q5 food | a keep Fuel + photo logging (night two) | store |
| q6 email | a unread-24h + broadcasts | store |
| q7 offers | a cards + requests, checkout night two | store |
| q8 history | a 30 days | store |

## W.0 preflight (Fable, 2026-10-21)

- Baseline before anything moved: server tests 68/68 (scratch recipe), `npm run build` passes.
- Committed on `main`: `54525c5` (U9/U10/U10b work), `65fa755` (round kit), `d21b216` (history tests, on `overhaul`, reaches `main` at the first fast-forward). Secret scan of the staged diff: no matches.
- Branch `prototype` = `54525c5`, pushed. Netlify site `workhart` production branch: `main` → `prototype` (first two API attempts with partial bodies did nothing; resending the full `build_settings` object with `repo_branch: prototype` took). A build from `prototype` was triggered after the switch; state recorded below when read.
- Branch `overhaul` created from `main`, pushed.
- Droplet dump before any migration: `/var/backups/workhart-pre-overhaul-2026-10-21.sql.gz`, 28,768 bytes.
- Truth-check: `CLAUDE.md` said `src/history.test.js` exists; it did, but was untracked. Now committed.

## W.1 trainer tenancy — GREEN (sonnet, first attempt)
- Builder: 83/83. Fable re-run: migrate up (applied) / up (no-op) / down / up clean; `# tests 83 # pass 83 # fail 0`; trainer_id-from-input grep empty; build passes.
- Trap: in zsh an unquoted `$VAR` holding two `K=V` pairs is ONE word, so `env $R node ...` set nothing and every test refused to run (fail 83). Export the vars instead.
- Security read: roster/overview/settings/workouts/assignments/drafts/inbox/threads all carry `req.user.id`; add-client inserts `trainer_id = req.user.id`, 409 on a global email match, rate-limited per trainer, mail failure logged not fatal.
- Deviations accepted: two roster assertions flipped (the admin row is no longer in the roster, by design); tests split finer.
- Ship: main `79150d0`; deploy OK; prod migration `1790100000000_trainer-tenancy` applied; users admin 1 (trainer_id 0), user 4 (trainer_id 4); health `db:true`. Netlify prototype: deploy state ready from branch `prototype` @ `54525c5`, site 200.

## W.2 programs and bundles — GREEN (sonnet, first attempt)
- Builder: 91/91 (the ask's "pass >= 95" was Fable's miscount: 83 + 8 new = 91). Fable re-run: migrate down/up clean; `# tests 91 # pass 91 # fail 0`; build passes.
- Security read: every route checks `programs.trainer_id`, `workouts.created_by` or `users.trainer_id` against `req.user.id` before BEGIN; enrol and bulk use `ON CONFLICT DO NOTHING`; delete relies on the no-cascade FK (409).
- Deviations accepted: non-uuid ids 404; PATCH description null clears; calendar 400 body `invalid_query`.
