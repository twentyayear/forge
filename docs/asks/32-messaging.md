# Ask 32 — U6: Messaging (Kyle ↔ athlete threads)

## Objective
One message thread per athlete (with Kyle), both directions, server mode only:
- **Athlete:** the Coach tab's mock comments section becomes the real thread — Kyle's messages as cards with an optional play button (existing `speak()` path), a reply composer, unread badge on the Coach nav icon.
- **Kyle console:** an Inbox — users with latest-message preview + unread counts → thread view → reply. Also reachable from a user's dashboard.

Read `CLAUDE.md` first; hard rules apply (no speechSynthesis — the play button uses the existing ElevenLabs `speak()` only; never print secrets; commit nothing; no deletes). Prototype mode stays byte-identical.

## Measured facts (don't re-derive)
- `messages` table (already migrated, ask 25): `{id uuid, user_id → users (the thread key — one thread per athlete), sender CHECK ('user'|'kyle'), body text NOT NULL, ai_generated bool default false, read_at timestamptz, created_at}`, index `(user_id, created_at)`. **No schema changes** — if you think one is needed, STOP and say why.
- `ai_generated` stays `false` everywhere this unit (U7's field).
- Coach tab: `tab === "coach"` render at Forge.jsx:2742 — keep the Kyle video card + PROGRAMS list; the mock comments/composer section is what the real thread replaces in server mode. Nav tabs defined ~:2909.
- Console (ask 31): admin lands on roster; follow its screen-state pattern for adding Inbox.
- Read semantics: a message is unread until the OTHER side views the thread. Athlete opening the Coach tab marks kyle-sent rows read; Kyle opening a user's thread marks user-sent rows read.

## 1. Backend (new `server/messages.js`, mounted in `app.js`)
Athlete (requireUser, all scoped to `req.user.id`):
- `GET /api/messages` → own thread asc `[{id, sender, body, ai_generated, created_at}]`.
- `POST /api/messages {body}` → insert sender `'user'`; validate body non-empty after trim, ≤2000 chars (400 generic). Returns the row.
- `POST /api/messages/read` → `UPDATE ... SET read_at=now() WHERE user_id=$me AND sender='kyle' AND read_at IS NULL`; returns `{marked: n}`.

Admin (requireAdmin):
- `GET /api/admin/inbox` → one row per athlete who has any messages OR any assignments: `{user: {id,name,email}, last_message: {sender,body,created_at}|null, unread: n}` (unread = that user's user-sent rows with `read_at IS NULL`), ordered by last message desc, nulls last. One query (lateral join or window fn), no N+1.
- `GET /api/admin/users/:id/messages` → that user's thread asc (404 unknown user) AND marks their user-sent unread rows read in the same request (return the thread post-mark; include `{marked: n}`).
- `POST /api/admin/users/:id/messages {body}` → insert sender `'kyle'` (same validation; 404 unknown user). Returns the row.

Bootstrap addition (`server/data.js`, additive only): `unreadMessages` = count of the session user's kyle-sent unread rows.

## 2. Athlete UI (server mode only)
- Coach tab: real thread below the video/programs cards (replacing the mock comments section in server mode): Kyle messages left-aligned cards with a small speaker/play button (→ `speak(body)`, no autoplay), user messages right-aligned; composer at the bottom (reuse the existing composer styling); optimistic append on 200 only. Fetch thread when the tab opens; POST `/api/messages/read` after render (then zero the badge).
- Coach nav icon: unread badge (count from bootstrap `unreadMessages`, updated after the read POST). Match the app's chip/badge styling; keep it subtle.

## 3. Console UI
- Console nav gains **Inbox** (alongside Roster): list from `/api/admin/inbox` — name, last message preview (one line, truncated), relative day, unread count chip; click → thread view (same left/right layout, Kyle on the right here) + composer POSTs the reply; opening the thread already marks-read server-side — reflect it.
- User dashboard (ask 31) gains a "Message" button → same thread view.

## 4. Tests (`server/test/messages.test.js`; extend data.test.js only for the bootstrap count)
1. 401 sweep (all new routes); admin routes 404 to non-admin.
2. Athlete POST + GET round-trip; body validation (empty, 2001 chars → 400).
3. Athlete A cannot see athlete B's thread (scoping).
4. Read semantics both directions: kyle-sent unread → athlete `POST /read` marks exactly those; user-sent unread → admin GET thread marks them; counts prove it.
5. Inbox shape: last_message correct, unread counts correct, user with assignments but no messages appears with null last_message.
6. Bootstrap `unreadMessages` correct.

## Hard rules
- Prototype mode byte-identical (everything gated on `SERVER_MODE` / role). Both builds must pass.
- No new npm deps. No schema changes. Server changes limited to messages.js + mounting + the bootstrap count (+ tests).
- Live green-light writes happen as the test users (hey+gl, hey+kyle) — Sam's account stays untouched.

## Green-light (run each, report PASS/FAIL with actual output)
```
npm run build && VITE_SERVER_MODE=1 npm run build        # both pass
ssh workhart 'cd /srv/workhart/server && npm test'       # all suites pass (33 + new) — report counts
./ops/deploy.sh                                          # green end-to-end
curl -s -o /dev/null -w "%{http_code}\n" https://alphaecho.io/api/messages          # 401
curl -s -o /dev/null -w "%{http_code}\n" https://alphaecho.io/api/admin/inbox       # 401
# Live, in the browser on alphaecho.io (report each step with what you saw):
#  1. Sign in as hey+kyle → Inbox → open GL Throwaway → send "How did the session feel?"
#  2. Sign out → sign in as hey+gl → Coach nav shows unread badge (1) → open Coach tab → Kyle's card renders, play button present → badge clears → reply "Felt strong."
#  3. Sign out → back as Kyle → Inbox shows GL with unread 1 + "Felt strong." preview → open thread → both messages in order, unread clears
#  4. psql: 2 message rows for GL's user_id, both read_at NOT NULL, senders kyle/user
curl -s https://alphaecho.io/api/health                  # still ok, db true
# Prototype regression (:4890 or preview, NO flag): Coach tab still shows the mock comments UI unchanged
```
Report every line PASS/FAIL with actual output, then stop.
