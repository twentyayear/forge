// PURE TRAINER HELPERS: NO REACT, NO NETWORK. THE CALLER PASSES today SO TESTS OWN THE CLOCK.
import { iso } from "../data/dates.js";

const parseDay = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};

// MONDAY THROUGH SUNDAY OF THE WEEK HOLDING todayStr, AS PLAIN YYYY-MM-DD DAYS.
export function weekRange(todayStr) {
  const base = parseDay(todayStr);
  const back = (base.getDay() + 6) % 7;
  const from = new Date(base.getFullYear(), base.getMonth(), base.getDate() - back);
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6);
  return { from: iso(from), to: iso(to) };
}

// THE CHIP TEXT ON A NEEDS-YOU ROW.
export function needsYouLabel(entry) {
  if (entry.kind === "missed") return `${entry.count} missed`;
  if (entry.kind === "unread") return "Unread";
  return "Review";
}

const shortDay = (s) => parseDay(s).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

// "Lower A Wed, Oct 22 · streak 4" OR "No session scheduled".
export function clientSubline(client) {
  if (!client.next) return "No session scheduled";
  return `${client.next.title} ${shortDay(client.next.scheduled_for)} · streak ${client.streak || 0}`;
}

// ONE POINT PER DAY FOR THE LAST days DAYS ENDING AT today; A DAY WITHOUT A CHECK-IN IS score: null SO THE LINE BREAKS INSTEAD OF INVENTING A VALUE.
export function trendPoints(checkins, days, today) {
  const byDay = new Map();
  for (const c of checkins || []) byDay.set(String(c.day).slice(0, 10), c.score);
  const end = parseDay(today);
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = iso(new Date(end.getFullYear(), end.getMonth(), end.getDate() - i));
    out.push({ day, label: day.slice(5), score: byDay.has(day) ? byDay.get(day) : null });
  }
  return out;
}

// THE LEGACY BUILDER'S MAPPING: A BLANK WEIGHT IS null (BODYWEIGHT), REPS ARE AT LEAST 1, rest_sec AND note ARE SENT ONLY WHEN THE TRAINER FILLED THEM.
export function blocksFromEditor(exercises) {
  return (exercises || []).map((e) => {
    const block = {
      exercise_key: e.exercise_key,
      sets: (e.sets || []).map((s) => ({
        reps: Math.max(1, parseInt(s.reps, 10) || 1),
        weight_lbs: s.weight_lbs === "" || s.weight_lbs == null || !Number.isFinite(Number(s.weight_lbs)) ? null : Number(s.weight_lbs),
      })),
    };
    if (e.rest_sec !== "" && e.rest_sec != null && Number.isFinite(Number(e.rest_sec))) block.rest_sec = Number(e.rest_sec);
    if (e.note && String(e.note).trim()) block.note = String(e.note).trim();
    return block;
  });
}

// CLIENTS WHOSE DRAFT TEXT IS IDENTICAL SHARE ONE BROADCAST; ORDER OF FIRST APPEARANCE IS KEPT AND BLANK DRAFTS ARE LEFT OUT.
export function groupByBody(drafts) {
  const groups = [];
  for (const d of drafts || []) {
    const body = String(d.body ?? "").trim();
    if (!body) continue;
    const hit = groups.find((g) => g.body === body);
    if (hit) hit.user_ids.push(d.user_id);
    else groups.push({ body, user_ids: [d.user_id] });
  }
  return groups;
}

// DOLLARS TYPED BY THE TRAINER TO INTEGER CENTS; ANYTHING UNREADABLE OR NEGATIVE IS 0.
export function dollarsToCents(text) {
  const n = parseFloat(String(text ?? "").replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

// "$45" FOR WHOLE DOLLARS, "$45.50" OTHERWISE, "No price" FOR ZERO.
export function priceLabel(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n) || n <= 0) return "No price";
  return n % 100 === 0 ? `$${n / 100}` : `$${(n / 100).toFixed(2)}`;
}

// A REST DAY HAS NO WORKOUT; EVERY OTHER DAY IS ONE SESSION.
export function programSessionCount(days) {
  return (days || []).filter((d) => d.workout_id != null && d.workout_id !== "").length;
}

// THE LIST WITH THE ITEM AT index SWAPPED ONE STEP (dir -1 UP, +1 DOWN); OUT OF RANGE RETURNS THE LIST UNCHANGED.
export function moveItem(list, index, dir) {
  const to = index + dir;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const next = list.slice();
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

// "now", "5m", "3h", "2d", THEN A SHORT DATE; now IS PASSED IN SO TESTS OWN THE CLOCK.
export function ageLabel(ts, now = new Date()) {
  const ms = new Date(now).getTime() - new Date(ts).getTime();
  if (!Number.isFinite(ms)) return "";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.floor(min / 60)}h`;
  if (min < 10080) return `${Math.floor(min / 1440)}d`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// THE INBOX TAB BADGE: EVERY UNREAD THREAD COUNT PLUS THE DRAFTS WAITING.
export function inboxBadge(rows, drafts) {
  const unread = (rows || []).reduce((n, r) => n + (Number(r.unread) || 0), 0);
  return unread + (drafts ? drafts.length : 0);
}

// A COUNT THE SERVER MAY SEND AS A NUMBER OR AS A LIST.
export function countOf(v) {
  return Array.isArray(v) ? v.length : Number(v) || 0;
}
