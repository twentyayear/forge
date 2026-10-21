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
- Ship: main `5ea92ad`; deploy OK; prod migration `1790200000000_programs` applied; programs 0; health `db:true`.

## W.3 coach lines — GREEN (sonnet, first attempt)
- Builder: 98/98. Fable re-run: migrate down/up clean; `# tests 98 # pass 98 # fail 0`; `media.js`/`media-lib.js` diff 0 lines; build passes.
- Security read: assignment ownership by `(id, user_id)` before any read of sets; previous sets and check-in read by `user_id` only; log line carries user id, kind, source, never the text; `ON CONFLICT ... DO UPDATE SET text = coach_lines.text` keeps the first writer's line.
- Deviations accepted: prompt composed by slicing `SYSTEM_PROMPT`; empty `sets` allowed for `exercise`.
- Ship: main `59d0cbc`; rsync + migrate `1790300000000_coach-lines` + restart all ran; the script's verify (`sleep 1` then curl) got a 502 because node listened one second after the restart, so the script exited before printing "deploy OK". Read-back 20 s later: health `db:true`, `NRestarts=0`, journal clean, `ANTHROPIC_API_KEY` present (count 1). Fix queued for the W.4 commit: verify waits 3 s.

## W.4 achievements — GREEN (sonnet, first attempt)
- Builder: 108/108. Fable re-run: migrate down/up clean; `# tests 108 # pass 108 # fail 0`; build passes.
- Read: both writes evaluate inside BEGIN/COMMIT with `today` from `CURRENT_DATE`; `user_achievements` PK is the idempotency; every rule guarded per kind.
- Deviations accepted: `new_pr` one per log (first PR exercise in set order); blurbs keep `<exercise>`/`<program>` placeholders (the client fills them from `context`); extra `context(ctx)` per registry entry.
