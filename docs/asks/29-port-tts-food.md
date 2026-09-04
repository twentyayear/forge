# Ask 29 — U4: Port /api/tts + /api/food to the droplet

## Objective
alphaecho.io becomes self-contained: Kyle's voice and food search served by the Express API instead of 404ing. The two Netlify functions (`netlify/functions/tts.mjs`, `food.mjs`) are the reference implementations — port their behavior into the server, don't redesign it. Netlify keeps its functions untouched (prototype path unchanged).

Read `CLAUDE.md` first; hard rules apply. The Kyle voice recipe is Sam-tuned and copied VERBATIM: allowlist of exactly one voice `ZAIovxRU9FXNYmauX8CL`, model `eleven_multilingual_v2`, voice_settings `{stability: 0.5, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true, speed: 0.85}`, and the sentence-boundary transform `text.replace(/([.!?])\s+/g, '$1 <break time="0.6s" /> ')`. Any drift fails the unit.

## Measured facts (don't re-derive)
- Frontend already calls `POST /api/tts` (`TTS_ENDPOINT` const, Forge.jsx:42, body `{text, voice_id}`) and `GET /api/food?q=` — same-origin fetch, so the session cookie rides along automatically. **No `src/` changes.**
- nginx already proxies all of `/api` to :8790 — no nginx changes. But CHECK `proxy_buffering`/timeouts don't break the streamed audio body; if the default config works (curl gets audio bytes), leave it alone.
- `server/index.js` fail-fast validates DATABASE_URL/PORT/RESEND_API_KEY. `ELEVENLABS_API_KEY` is OPTIONAL — missing key must NOT crash boot; `/api/tts` returns `503 "TTS not configured"` (exactly like the Netlify function).
- OFF search host is `https://search.openfoodfacts.org` (no CORS — that's why it's proxied); response `hits[]`, `brands` may be an ARRAY (join with ", "), per-serving values preferred over per-100g (`_serving` suffix when either `energy-kcal_serving` or `proteins_serving` exists).

## 1. Routes (new `server/media.js` or similar, mounted in `app.js`)
- `POST /api/tts` — **requireUser** (the droplet spends ElevenLabs credits; prototype's open Netlify function is its own path). Then byte-for-byte the reference behavior: 400 missing text / unknown voice, text sliced to 300 chars, allowlist check, break-injection transform, origin-pinned fetch to `https://api.elevenlabs.io`, 502 on upstream failure, stream the body back as `audio/mpeg` with `Cache-Control: no-store`. Never log the key or the upstream headers. Add a per-user rate limit (express-rate-limit, keyed on `req.user.id`): 60 requests / hour → 429.
- `GET /api/food` — **requireUser**. Port `food.mjs` exactly: q trimmed, 400 outside 2–40 chars, page_size 8, same fields list, same mapping/preference/rounding rules, same `{results}` shape, `Cache-Control: public, max-age=300`, User-Agent updated to `Workhart-Alphaecho/1.0 (personal use)`.

## 2. Testability
Extract two pure functions and export them (from the new module or a small `server/media-lib.js`): the sentence-break transform and the OFF hit→result mapper. Route handlers use them; tests import them. No fetch mocking, no live upstream calls in tests.

## 3. Tests (`server/test/media.test.js`, same boot pattern as the other suites)
1. `POST /api/tts` and `GET /api/food?q=chicken` → 401 without a session.
2. With a session: tts 400 on empty text; 400 on any voice_id other than the allowlisted one; 503 when `ELEVENLABS_API_KEY` unset (ensure it's unset in the test env).
3. With a session: food 400 on `q=a` and on a 41-char q.
4. Pure transform test: multi-sentence string gets `<break time="0.6s" />` after each `.`/`!`/`?`; single sentence without trailing space unchanged.
5. Pure mapper test with fixture hits: per-serving preferred, per-100g fallback, brands-array joined, nameless and all-zero-macro hits dropped, values rounded to 1 decimal.

## 4. Key installation (coordinate, don't handle)
`ELEVENLABS_API_KEY` goes into `/etc/workhart/env` — the ORCHESTRATOR installs it via the clipboard pipe (never you, never echoed). If at green-light time the key is absent, run the tts lines expecting 503 and mark them `BLOCKED-ON-KEY (503 verified correct)` — that is a passing report for your unit; the audio curl gets re-run after install.

## Hard rules
- No new npm deps. No `src/`, `netlify/`, nginx, or systemd changes. No commits.
- Voice recipe verbatim (see above). Never print any part of any key.
- `/api/tts` upstream errors: body text stays generic ("Upstream error") — no ElevenLabs response bodies leaked to clients or logs.

## Green-light (run each, report PASS/FAIL with actual output)
```
ssh workhart 'cd /srv/workhart/server && npm test'                                # all suites pass (21 + new) — report counts
./ops/deploy.sh                                                                   # green end-to-end
curl -s -o /dev/null -w "%{http_code}\n" 'https://alphaecho.io/api/food?q=chicken'          # 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://alphaecho.io/api/tts               # 401
# authenticated (mint-link for hey+gl@blueroutevineyard.com → cookie jar):
#   curl -c jar the verify URL, then:
curl -s -b jar 'https://alphaecho.io/api/food?q=chicken'                          # 200, results[] with kcal/protein/carbs/fat — paste first result
curl -s -b jar -X POST https://alphaecho.io/api/tts -H 'content-type: application/json' \
  -d '{"text":"Welcome back. Push day.","voice_id":"ZAIovxRU9FXNYmauX8CL"}' \
  -o /tmp/tts.mp3 -w "%{http_code} %{content_type} %{size_download}\n"            # 200 audio/mpeg >10000 bytes — or 503 BLOCKED-ON-KEY if the key isn't installed yet
curl -s https://alphaecho.io/api/health                                           # still ok, db true
```
Report every line PASS/FAIL with actual output, then stop.
