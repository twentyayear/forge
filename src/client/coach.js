// PURE COACH HELPERS: NO REACT, NO NETWORK. now IS PASSED IN SO TESTS OWN THE CLOCK.

const pad = (n) => String(n).padStart(2, "0");
const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Today / Yesterday / "Mon, Oct 19" FOR THE LOCAL DAY OF date, RELATIVE TO now.
export function dayLabel(date, now = new Date()) {
  const d = new Date(date);
  const key = localDay(d);
  if (key === localDay(now)) return "Today";
  const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (key === localDay(yest)) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// CONSECUTIVE MESSAGES OF THE SAME LOCAL DAY SHARE ONE GROUP; ORDER IS KEPT (THE SERVER SENDS OLDEST FIRST).
export function groupByDay(messages, now = new Date()) {
  const groups = [];
  for (const m of messages || []) {
    const key = localDay(new Date(m.created_at));
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.messages.push(m);
    else groups.push({ key, label: dayLabel(m.created_at, now), messages: [m] });
  }
  return groups;
}

// "$45.00"; EMPTY WHEN THE OFFER HAS NO PRICE SO THE CARD HIDES IT.
export function priceLabel(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `$${(n / 100).toFixed(2)}`;
}

export const timeLabel = (ts) => new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

// BODYWEIGHT SETS (NULL WEIGHT) ADD NO VOLUME.
export function logVolume(sets) {
  return (sets || []).reduce((s, r) => s + (Number(r.reps) || 0) * (Number(r.weight_lbs) || 0), 0);
}

// SETS GROUPED BY EXERCISE IN THE ORDER THE EXERCISE FIRST APPEARS, EACH EXERCISE'S SETS BY set_no.
export function setsByExercise(sets) {
  const map = new Map();
  for (const s of sets || []) {
    if (!map.has(s.exercise_key)) map.set(s.exercise_key, []);
    map.get(s.exercise_key).push(s);
  }
  return [...map].map(([key, rows]) => ({ key, rows: rows.sort((a, b) => a.set_no - b.set_no) }));
}
