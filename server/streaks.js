// SERVER/STREAKS.JS: PURE STREAK AND WEEK HELPERS, NO DB AND NO CLOCK.
// EVERY FUNCTION TAKES TODAY EXPLICITLY SO THE CALLER CHOOSES THE DB CLOCK.
import { isoWeekKey as isoWeekKeyFromDate } from "./jobs.js";

function parseDay(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`);
}

function prevDay(dateStr) {
  const d = parseDay(dateStr);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function sessionStreak(assignments, today) {
  const byDay = new Map();
  for (const a of assignments ?? []) {
    if (a.scheduled_for > today) continue;
    const entry = byDay.get(a.scheduled_for) ?? true;
    byDay.set(a.scheduled_for, entry && a.status === "completed");
  }
  const days = [...byDay.keys()].sort().reverse();
  let n = 0;
  for (const day of days) {
    if (!byDay.get(day)) break;
    n++;
  }
  return n;
}

export function checkinStreak(days, today) {
  const have = new Set(days ?? []);
  let n = 0;
  let cursor = today;
  while (have.has(cursor)) {
    n++;
    cursor = prevDay(cursor);
  }
  return n;
}

export function isoWeekKey(dateStr) {
  return isoWeekKeyFromDate(parseDay(dateStr));
}

export function epley(weightLbs, reps) {
  if (!weightLbs) return 0;
  return weightLbs * (1 + reps / 30);
}
