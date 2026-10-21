# Loose ends

The one list of everything unbuilt, undecided or unverified. One heading per item, numbered once, never renumbered; a closed item is deleted. **Decision needed** marks a judgement call for Sam. **[server]** / **[browser]** tag items that cannot be verified from the repo alone.

## 3. Netlify prototype functions still in `main`
`netlify/functions/` (tts and food proxies for the prototype) stay in the tree; the prototype branch keeps its own copy. Deleting them from `main` is a one-line change. **Decision needed:** delete now or keep until the prototype site is retired.

## 4. Test accounts in production [server]
`poison-verify@workhart-test.local`, `poison-verify-2@workhart-test.local` (U8), `hey+gl@blueroutevineyard.com` (the green-light client) and `hey+w9@blueroutevineyard.com` (the W.9 add-client walk) are real rows. They show in Kyle's roster. **Decision needed:** which to delete (the global rule: nothing is deleted without Sam's word).

## 5. Stripe subscriptions and the coaching gate (night two)
SPEC §0 q3: coaching is the plan, the self-guided library is free. Nothing is built: no `stripe-billing` units, no entitlement, no paywall; every client is coached today. Cost: the subscription units of the night-two list (Checkout with Apple Pay / Google Pay / Link, portal, webhook-driven entitlements, the gate on assignments, Kyle's messages and Kyle's voice). **Decision needed:** the monthly and annual prices.

## 6. Web push (night two)
No push for installed phones; Kyle's messages reach the client only in-app and, after 24 hours unread, by email. Cost: VAPID keys, a `push_subscriptions` table, a service-worker `push` handler, one job.

## 7. Wearables (night two, q4)
Oura, Whoop and Garmin by direct OAuth; readiness from sleep and HRV. Apple Watch and Health Connect need a native shell (q4 option b, deferred). The `device` field in You is a label only today.

## 8. Food photo logging (night two, q5)
Fuel runs on Open Food Facts search, quick add and manual entries. A photo of the plate through Claude vision is not built. MyFitnessPal's API is partner-only; the indirect path is Apple Health through the native shell.

## 9. One-time offer checkout (night two, q7)
Offers are cards and requests; no payment. Stripe Checkout one-time payments follow the subscription work.

## 10. History window is a server constant
`HISTORY_DAYS_FREE = 30` in `server/data.js`; the plan is meant to widen it (q8). Needs item 5 first.

## 11. GitHub repo name
The repo is still `twentyayear/forge`; folder, package and app are `workhart`. Renaming is a GitHub setting plus the Netlify link and every clone's remote. **Decision needed:** when.

## 12. Trainer console on a phone [browser]
The console was built laptop-first with a one-column fallback below 900 px and checked in Chrome at 390 px against mocks and at 430 px live. A real phone walk of Build, Compose and Offers is owed.

## 13. Install prompt and service worker on real phones [browser]
The manifest, icons and `public/sw.js` are served (nginx maps the manifest type). An install on a real iPhone (Share → Add to Home Screen) and a real Android (the install card) are not yet seen.

## 14. `new_pr` earns once per log
`server/achievements.js` `new_pr` dedupes by one exercise per log (the first PR in set order). Two PRs in one session earn one row. Cost: a multi-instance registry shape. Low.

## 15. Reduced-motion rendering not exercised [browser]
The waveform, the Celebration spring and the ring sweep are gated on `prefers-reduced-motion`; nobody has viewed the app with it on.

## 16. CSV export and PR/Max chips beyond the window
The old Progress CSV export left with the legacy file; History shows 30 days with every set. A client export of all history waits for item 5's decision on windows.

## 17. Voice recipe helper duplication
`speechify` and `SPOKEN_WORDS` live in `src/lib/speech.js` (client) while the server inserts the pauses; a word added to one list is not added to the other. Fine today; worth a single shared list if the list grows.

## 18. Inbox thread rows were blank on first live view (fixed forward in the close commit)
`src/trainer/Inbox.jsx` read the raw SQL column names; the route returns `{user, last_message, unread}`. Fixed. Lesson for asks: quote the route's response mapping, not its SELECT.
