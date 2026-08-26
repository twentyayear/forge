# Ask 05 — Session comments (Coach tab)

## Context
Repo: `/Users/sm-pro/Projects/forge`, file `src/Forge.jsx`. Tokens `C`, helpers `Label/Card/Pill`,
input style `inp`, buttons `btnP/btnG`, avatar style `ava`. Past-done days (Today tab) already have a
"Comment on Session" button that does `setTab("coach")`. Coach tab structure: header card → "Recent
updates" Card → "Message Coach Mike" button → "Data your coach sees". Only edit `src/Forge.jsx`;
no servers; voice code byte-identical, no new speak calls.

## The unit
1. State in `Forge()`:
   `const [comments, setComments] = useState([]);` — `{ text, ref, time: "Just now" }`, `ref` is
   `{ name, date } | null`;
   `const [commentRef, setCommentRef] = useState(null);`
   `const [draft, setDraft] = useState("");`
2. Past-done "Comment on Session" button: before `setTab("coach")`, also
   `setCommentRef({ name: entry.name, date: fmtLong(selDate) })`.
3. Coach tab — insert a new section between the "Message Coach Mike" button and the
   "Data your coach sees" Label:
   - `<Label>Session comments</Label>` then a Card containing:
     - The comment list: each comment row (divider `1px solid C.line` between rows like "Recent
       updates") shows — if `ref`: an energy `Pill` with `{ref.name} · {ref.date}` (fontSize 10)
       above the text — then the text (13.5px `C.body`, lineHeight 1.55) and a muted 11.5px line
       `Just now · seen by Coach Mike`.
     - Empty state when no comments: muted 12.5px `No comments yet — open a logged workout and tap
       Comment on Session.`
     - Composer at the bottom of the Card (top border `1px solid C.line`, paddingTop 12):
       - If `commentRef`: a dismissible chip row — energy Pill `Re: {commentRef.name} ·
         {commentRef.date}` + a small X icon-button (aria-label "Clear session reference",
         min 32px hit area) that `setCommentRef(null)`.
       - Flex row: `<input aria-label="Comment" placeholder="Write a comment…">` using the `inp`
         style but `marginBottom: 0, flex: 1, minHeight: 44` bound to `draft`, plus a Send button
         (btnP but `padding: "0 18px", minHeight: 44`) — disabled (opacity .45, no-op) when
         `draft.trim()` is empty — onClick: append `{ text: draft.trim(), ref: commentRef,
         time: "Just now" }` to `comments`, then `setDraft("")` and `setCommentRef(null)`.
         Enter key in the input submits too.

## Guardrails
Match existing idiom. Don't touch the rest of the Coach tab, voice, schedule, sheets.

## Green-light
```bash
npm run build                                # exit 0
grep -c "Session comments" src/Forge.jsx     # 1
grep -c "commentRef" src/Forge.jsx           # ≥ 5
grep -c "speechSynthesis" src/Forge.jsx      # exactly 5
```
