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
