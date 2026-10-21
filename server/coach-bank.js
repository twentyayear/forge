// server/coach-bank.js -- W.3: the fallback bank for coach lines. Pure, no DB,
// no imports. Used when Claude fails so the athlete still hears Kyle.

const FALLBACK = "Good work. Keep moving.";

// TARGETED SETS ARE THOSE CARRYING A NON-NULL target_reps; WITHOUT ANY, THERE IS NOTHING TO JUDGE AGAINST.
export function outcomeFor(sets) {
  const list = Array.isArray(sets) ? sets : [];
  const targeted = list.filter((s) => s && s.target_reps != null);
  if (targeted.length === 0) return "logged";
  if (targeted.some((s) => s.reps < s.target_reps)) return "short";
  if (targeted.some((s) => s.reps > s.target_reps)) return "over";
  return "hit";
}

// EACH FUNCTION TAKES (NAME, NUMBER) SO EVERY LINE NAMES THE EXERCISE AND CITES ONE NUMBER.
const BANK = {
  "exercise:hit": [
    (n, x) => `${n}, every rep you planned. ${x} was clean work.`,
    (n, x) => `That is how ${n} is done. ${x} and nothing left on the table.`,
    (n, x) => `${n} finished on target. ${x}. Rest, then we go again.`,
  ],
  "exercise:short": [
    (n, x) => `${n} got tough and you stayed with it. ${x}. We build from here.`,
    (n, x) => `Not every ${n} day goes to plan. ${x} is still real work.`,
    (n, x) => `You fell a little short on ${n}. ${x}. Recover and own it next time.`,
  ],
  "exercise:over": [
    (n, x) => `${n} went past the plan. ${x}. Strong, controlled work.`,
    (n, x) => `You beat the target on ${n}. ${x}. That is progress.`,
    (n, x) => `Extra reps on ${n}. ${x}. We may move the weight up soon.`,
  ],
  "exercise:logged": [
    (n, x) => `${n} is in the books. ${x}. Nice work.`,
    (n, x) => `Logged ${n}. ${x}. Keep stacking sessions.`,
    (n, x) => `${n} done. ${x}. Use your rest and stay sharp.`,
  ],
  finish: [
    (n, x) => `Session done. ${x}. That is how you show up.`,
    (n, x) => `Finished. ${x}. Eat, hydrate, and rest well.`,
    (n, x) => `Good session today. ${x}. See you at the next one.`,
  ],
};

// ONE NUMBER PER LINE: THE TOP WEIGHT WHEN ANY SET HAS ONE, ELSE TOTAL REPS, ELSE NONE.
function numberPhrase(sets) {
  const list = Array.isArray(sets) ? sets : [];
  const weights = list.map((s) => Number(s?.weight_lbs)).filter((w) => Number.isFinite(w) && w > 0);
  if (weights.length) return `${Math.max(...weights)} pounds on top`;
  const total = list.reduce((a, s) => a + (Number(s?.reps) || 0), 0);
  if (total > 0) return `${total} total reps`;
  return "Real effort";
}

export function bankLine({ kind, outcome, exerciseName, sets }) {
  const key = kind === "finish" ? "finish" : `exercise:${BANK[`exercise:${outcome}`] ? outcome : "logged"}`;
  const lines = BANK[key];
  const list = Array.isArray(sets) ? sets : [];
  const repSum = list.reduce((a, s) => a + (Number(s?.reps) || 0), 0);
  const name = String(exerciseName || "").slice(0, 80) || "That exercise";
  const text = lines[repSum % lines.length](name, numberPhrase(list));
  return text.length <= 180 ? text : text.slice(0, 179) + "…";
}

// CUTS AT THE LAST SENTENCE END BEFORE 220; A LINE WITH NO SENTENCE END IS HARD-CUT SO THE DB CHECK (1-220) CAN NEVER FAIL.
export function clampLine(text) {
  const t = String(text ?? "").trim();
  if (!t) return FALLBACK;
  if (t.length <= 220) return t;
  const head = t.slice(0, 220);
  const cut = Math.max(head.lastIndexOf("."), head.lastIndexOf("!"), head.lastIndexOf("?"));
  if (cut > 0) return head.slice(0, cut + 1);
  return t.slice(0, 217) + "…";
}
