// PURE SESSION ENGINE FOR THE CLIENT LOOP: NO REACT, NO NETWORK, NO CLOCK READS EXCEPT WHERE A now IS PASSED IN.
import { EX_INFO } from "../data/exercises.js";
import { iso } from "../data/dates.js";

// LOCAL CALENDAR DAY OF now; THE SERVER STORES check-in DAYS AND assignment DATES AS PLAIN DAYS.
export function todayStr(now = new Date()) {
  return iso(now);
}

// ONE sessionStorage KEY PER ASSIGNMENT SO TWO ASSIGNMENTS NEVER SHARE A HALF-FINISHED SESSION.
export function sessionKey(assignmentId) {
  return `workhart.session.${assignmentId}`;
}

// scheduled_for ARRIVES AS A FULL TIMESTAMP; ONLY THE FIRST TEN CHARACTERS ARE THE DAY.
export const dayOf = (v) => (typeof v === "string" ? v.slice(0, 10) : iso(new Date(v)));

// exercise_key IS THE LIBRARY NAME; A KEY WITH NO LIBRARY MATCH STILL RUNS, JUST WITHOUT CUES OR VIDEO.
export function sessionFromAssignment(a) {
  const w = a.workout || {};
  const exercises = (w.blocks || []).map((b) => ({
    key: b.exercise_key,
    name: b.exercise_key,
    info: EX_INFO[b.exercise_key] ?? null,
    restSec: b.rest_sec ?? 90,
    note: b.note ?? "",
    rows: (b.sets || []).map((s, i) => ({
      set_no: i + 1,
      reps: s.reps,
      weight_lbs: s.weight_lbs ?? null,
      target_reps: s.reps,
      target_weight_lbs: s.weight_lbs ?? null,
      done: false,
    })),
  }));
  return { assignmentId: a.id, title: w.title || "", programTitle: a.program_title || "", exercises };
}

const hasTarget = (r) => r.target_reps != null || r.target_weight_lbs != null;

// SAME RULE AS isHit IN src/ui/SetGrid.jsx (THAT FILE IS JSX AND CANNOT LOAD UNDER node --test): DONE AND BOTH TARGETS MET.
const rowHit = (r) => {
  if (!r.done) return false;
  const repsOk = r.target_reps == null || Number(r.reps) >= Number(r.target_reps);
  const weightOk = r.target_weight_lbs == null || Number(r.weight_lbs ?? 0) >= Number(r.target_weight_lbs);
  return repsOk && weightOk;
};

// COUNTS ONLY ROWS THE TRAINER SET A TARGET ON; total INCLUDES ROWS NOT DONE YET.
export function targetsHit(rows) {
  const targeted = rows.filter(hasTarget);
  return { hit: targeted.filter(rowHit).length, total: targeted.length };
}

// BODYWEIGHT (NULL WEIGHT) ADDS NO VOLUME; ONLY DONE ROWS COUNT.
export function volume(rows) {
  return rows.reduce((s, r) => (r.done ? s + (Number(r.reps) || 0) * (Number(r.weight_lbs) || 0) : s), 0);
}

// NEWEST LOG THAT CONTAINS THE EXERCISE, WHATEVER ORDER THE SERVER SENT THEM IN.
export function lastSessionFor(key, workoutLogs) {
  const logs = [...(workoutLogs || [])].sort((a, b) => Date.parse(b.performed_at) - Date.parse(a.performed_at));
  for (const log of logs) {
    const rows = (log.sets || []).filter((s) => s.exercise_key === key).sort((a, b) => a.set_no - b.set_no);
    if (!rows.length) continue;
    let top = rows[0];
    for (const r of rows) if ((Number(r.weight_lbs) || 0) > (Number(top.weight_lbs) || 0)) top = r;
    return {
      rows,
      volume: rows.reduce((s, r) => s + (Number(r.reps) || 0) * (Number(r.weight_lbs) || 0), 0),
      topWeight: top.weight_lbs == null ? null : Number(top.weight_lbs),
      topReps: Number(top.reps) || 0,
    };
  }
  return null;
}

// VOLUME OF THE MOST RECENT LOG, FOR THE FINISH SCREEN'S DELTA; null WHEN THERE IS NO EARLIER LOG.
export function previousLogVolume(workoutLogs) {
  const logs = [...(workoutLogs || [])].sort((a, b) => Date.parse(b.performed_at) - Date.parse(a.performed_at));
  if (!logs.length) return null;
  return (logs[0].sets || []).reduce((s, r) => s + (Number(r.reps) || 0) * (Number(r.weight_lbs) || 0), 0);
}

export function sessionTotals(exercises) {
  let hit = 0, total = 0, vol = 0, setsDone = 0;
  for (const ex of exercises) {
    const t = targetsHit(ex.rows);
    hit += t.hit; total += t.total;
    vol += volume(ex.rows);
    setsDone += ex.rows.filter((r) => r.done).length;
  }
  return { targetsHit: hit, targetsTotal: total, volume: vol, setsDone };
}

// +N / -N PERCENT OF prev; null WHEN THERE IS NOTHING TO COMPARE AGAINST (prev 0 OR MISSING).
export function percentVs(current, prev) {
  if (!prev) return null;
  return Math.round(((current - prev) / prev) * 100);
}

// MON..SUN OF THE WEEK HOLDING todayStr. DATES ARE BUILT FROM Y/M/D PARTS, NEVER BY ADDING 24 H, SO A DST WEEK KEEPS SEVEN DISTINCT DAYS.
export function weekStrip(assignments, today) {
  const [y, m, d] = today.split("-").map(Number);
  const base = new Date(y, m - 1, d);
  const mondayOffset = (base.getDay() + 6) % 7;
  const labels = ["M", "T", "W", "T", "F", "S", "S"];
  const byDay = new Map();
  for (const a of assignments || []) {
    const k = dayOf(a.scheduled_for);
    const prev = byDay.get(k);
    if (!prev || a.status === "completed") byDay.set(k, a);
  }
  return labels.map((label, i) => {
    const date = iso(new Date(y, m - 1, d - mondayOffset + i));
    const a = byDay.get(date);
    let state;
    if (date === today) state = "today";
    else if (date < today) state = !a ? "rest" : a.status === "completed" ? "done" : "missed";
    else state = a ? "assigned" : "rest";
    return { date, label, state, done: a?.status === "completed", assigned: !!a };
  });
}

// SETS x (REST + 45 S OF WORK), IN MINUTES, TO THE NEAREST 5; NEVER BELOW 5 FOR A NON-EMPTY SESSION.
export function estMinutes(exercises) {
  const secs = exercises.reduce((s, ex) => s + ex.rows.length * ((ex.restSec ?? 90) + 45), 0);
  if (!secs) return 0;
  return Math.max(5, Math.round(secs / 60 / 5) * 5);
}

// TODAY'S ASSIGNMENT: AN OPEN ONE BEATS A COMPLETED ONE; null WHEN THE DAY HAS NONE.
export function assignmentForDay(assignments, day) {
  const mine = (assignments || []).filter((a) => dayOf(a.scheduled_for) === day);
  return mine.find((a) => a.status === "assigned") ?? mine[0] ?? null;
}

export function nextAssignment(assignments, day) {
  return (assignments || [])
    .filter((a) => dayOf(a.scheduled_for) > day && a.status === "assigned")
    .sort((a, b) => dayOf(a.scheduled_for).localeCompare(dayOf(b.scheduled_for)))[0] ?? null;
}

export const fmtLbs = (n) => Number(n).toLocaleString("en-US");
export const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// "k OF n TARGETS HIT" FOR A PAST LOG: THE LOG'S SETS AGAINST THE TARGETS OF THE ASSIGNMENT IT WAS LOGGED FOR; null WHEN THAT ASSIGNMENT IS NOT IN THE BOOTSTRAP WINDOW.
export function hitsForLog(log, assignments) {
  const a = (assignments || []).find((x) => x.id === log?.assignment_id);
  if (!a) return null;
  const rows = [];
  for (const b of a.workout?.blocks || []) {
    (b.sets || []).forEach((s, i) => {
      const got = (log.sets || []).find((x) => x.exercise_key === b.exercise_key && x.set_no === i + 1);
      rows.push({ reps: got?.reps ?? 0, weight_lbs: got?.weight_lbs ?? null, target_reps: s.reps, target_weight_lbs: s.weight_lbs ?? null, done: !!got });
    });
  }
  const t = targetsHit(rows);
  return t.total ? t : null;
}

// VOLUME AS THE SCOREBOARD SHOWS IT: 3,515 BELOW 10,000, THEN 12.4 WITH A "k lb" UNIT.
export function fmtVolume(v) {
  return v >= 10000 ? { value: (v / 1000).toFixed(1), unit: "k lb" } : { value: fmtLbs(v), unit: "lb" };
}
