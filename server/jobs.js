// server/jobs.js — U8 (ask 34): the daily-monitor and weekly-summary handlers.
// Plain functions taking (pool, deps, {now}) so tests call them directly with
// no pg-boss and no Claude API -- deps.generateFromContext is injectable (the
// real one is ai.js's generateFromContext; tests pass a fake). pg-boss wiring
// lives in scheduler.js, which is the only thing that imports this module in
// production (plus admin.js's manual-trigger route).
//
// Idempotency: each handler claims a (job_name, dedupe_key) row in job_runs
// BEFORE doing any per-user work -- a second run with the same dedupe_key
// (same user, same day/ISO-week) is a no-op by construction (INSERT ... ON
// CONFLICT DO NOTHING, rowCount 0 -> skip). Per-user work is wrapped in its
// own try/catch so one athlete's failure never aborts the run for the rest.

const DAILY_MONITOR = "daily-monitor";
const WEEKLY_SUMMARY = "weekly-summary";

// A missed workout counts if the athlete's readiness mean has genuinely
// dropped, or is low outright -- either is a real 15-point relative drop
// vs. the week before, or a flat floor under 50. Two thresholds, not one,
// because a low-but-stable athlete (always ~45) shouldn't ping Kyle forever.
const SLUMP_RELATIVE_DROP = 15;
const SLUMP_FLOOR = 50;
const MISSED_WORKOUT_LOOKBACK_DAYS = 7;

// The per-user roster is snapshotted once at the top of a run (SELECT id FROM
// users WHERE role = 'user'), then worked one at a time -- a user deleted in
// the gap between that snapshot and their own turn trips job_runs' user_id FK
// (23503). That's a real, if rare, production race (an admin deletes an
// athlete mid-run), not a job failure -- skip that user rather than counting
// an error.
function isConcurrentUserDeleteError(err) {
  return err?.code === "23503";
}

function toDay(v) {
  return typeof v === "string" ? v.slice(0, 10) : new Date(v).toISOString().slice(0, 10);
}

// ---- ISO 8601 week helper (§6.1: must be correct across a year boundary) ----
// Standard "nearest Thursday" algorithm: the ISO week/year of a date is the
// week/year of the Thursday in that date's Mon-Sun week, and week 1 is the
// week containing the year's first Thursday (equivalently, containing Jan 4).
export function isoWeekInfo(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // nearest Thursday
  const isoYear = d.getUTCFullYear();

  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4DayNum = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4DayNum);

  const diffDays = Math.round((d - week1Monday) / 86400000);
  const isoWeek = Math.floor(diffDays / 7) + 1;
  return { isoYear, isoWeek };
}

export function isoWeekKey(date) {
  const { isoYear, isoWeek } = isoWeekInfo(date);
  return `${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
}

// ---- daily monitor ----

async function findMissedWorkouts(pool, userId, dayStr) {
  const { rows } = await pool.query(
    `SELECT wa.scheduled_for, w.title
     FROM workout_assignments wa
     JOIN workouts w ON w.id = wa.workout_id
     WHERE wa.user_id = $1 AND wa.status = 'assigned'
       AND wa.scheduled_for < $2::date
       AND wa.scheduled_for >= ($2::date - $3::int)
     ORDER BY wa.scheduled_for ASC`,
    [userId, dayStr, MISSED_WORKOUT_LOOKBACK_DAYS]
  );
  return rows.map((r) => ({ scheduled_for: toDay(r.scheduled_for), title: r.title }));
}

// ≥3 checkins required at all; then either the last 3 scores' mean is ≥15
// below the mean of the 7 before that, or the last-3 mean is below 50 outright.
async function findReadinessSlump(pool, userId) {
  const { rows } = await pool.query(
    `SELECT score FROM checkins WHERE user_id = $1 ORDER BY day DESC LIMIT 10`,
    [userId]
  );
  if (rows.length < 3) return null;

  const scores = rows.map((r) => r.score);
  const last3 = scores.slice(0, 3);
  const mean3 = last3.reduce((a, b) => a + b, 0) / last3.length;
  const prior = scores.slice(3, 10);
  const meanPrior = prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : null;

  const droppedFromPrior = meanPrior !== null && meanPrior - mean3 >= SLUMP_RELATIVE_DROP;
  const belowFloor = mean3 < SLUMP_FLOOR;
  if (!droppedFromPrior && !belowFloor) return null;

  return { type: "readiness_slump", mean3, meanPrior, droppedFromPrior, belowFloor };
}

async function findDailyFindings(pool, userId, dayStr) {
  const [missed, slump] = await Promise.all([
    findMissedWorkouts(pool, userId, dayStr),
    findReadinessSlump(pool, userId),
  ]);
  const findings = [];
  if (missed.length > 0) findings.push({ type: "missed_workout", assignments: missed });
  if (slump) findings.push(slump);
  return findings;
}

// runDailyMonitor(pool, deps, {now}) -> {users, acted, skipped, errors}
export async function runDailyMonitor(pool, deps, { now = new Date() } = {}) {
  const dayStr = toDay(now);
  const { rows: users } = await pool.query(`SELECT id FROM users WHERE role = 'user'`);
  const summary = { users: users.length, acted: 0, skipped: 0, errors: 0 };

  for (const { id: userId } of users) {
    const dedupeKey = `${userId}:${dayStr}`;
    try {
      const claim = await pool.query(
        `INSERT INTO job_runs (job_name, dedupe_key, user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [DAILY_MONITOR, dedupeKey, userId]
      );
      if (claim.rowCount === 0) {
        summary.skipped++;
        continue;
      }

      const findings = await findDailyFindings(pool, userId, dayStr);
      if (findings.length === 0) {
        // No news -- silence is correct. Record the result, send nothing.
        await pool.query(`UPDATE job_runs SET result = $1 WHERE job_name = $2 AND dedupe_key = $3`, [
          { findings: [] },
          DAILY_MONITOR,
          dedupeKey,
        ]);
        continue;
      }

      await deps.generateFromContext(pool, { userId, kind: "monitor", context: { findings }, triggerId: null });
      await pool.query(`UPDATE job_runs SET result = $1 WHERE job_name = $2 AND dedupe_key = $3`, [
        { findings: findings.map((f) => f.type) },
        DAILY_MONITOR,
        dedupeKey,
      ]);
      summary.acted++;
    } catch (err) {
      if (isConcurrentUserDeleteError(err)) {
        summary.skipped++;
        continue;
      }
      console.error(`${DAILY_MONITOR}: user ${userId} failed: ${err.message}`);
      summary.errors++;
    }
  }

  return summary;
}

// ---- weekly summary ----

async function buildWeeklyContext(pool, userId, now) {
  const end = toDay(now);
  const startDate = new Date(now);
  startDate.setUTCDate(startDate.getUTCDate() - 7);
  const start = toDay(startDate);

  const [assignRes, checkinRes, volumeRes, fuelRes] = await Promise.all([
    pool.query(
      `SELECT status FROM workout_assignments WHERE user_id = $1 AND scheduled_for >= $2 AND scheduled_for <= $3`,
      [userId, start, end]
    ),
    pool.query(`SELECT score FROM checkins WHERE user_id = $1 AND day >= $2 AND day <= $3`, [userId, start, end]),
    pool.query(
      `SELECT COUNT(DISTINCT wl.id)::int AS log_count, COALESCE(SUM(s.reps * s.weight_lbs), 0)::numeric AS volume
       FROM workout_logs wl
       LEFT JOIN workout_log_sets s ON s.log_id = wl.id AND s.user_id = wl.user_id
       WHERE wl.user_id = $1 AND wl.performed_at >= $2::date AND wl.performed_at < ($3::date + 1)`,
      [userId, start, end]
    ),
    pool.query(`SELECT COUNT(DISTINCT eaten_on)::int AS fuel_days FROM fuel_logs WHERE user_id = $1 AND eaten_on >= $2 AND eaten_on <= $3`, [
      userId,
      start,
      end,
    ]),
  ]);

  const assignmentsAssigned = assignRes.rows.length;
  const assignmentsCompleted = assignRes.rows.filter((r) => r.status === "completed").length;
  const checkinCount = checkinRes.rows.length;
  const meanScore = checkinCount ? checkinRes.rows.reduce((a, r) => a + r.score, 0) / checkinCount : null;
  const logCount = volumeRes.rows[0].log_count;
  const totalVolume = Number(volumeRes.rows[0].volume);
  const fuelDays = fuelRes.rows[0].fuel_days;

  const hasActivity = checkinCount > 0 || logCount > 0 || fuelDays > 0 || assignmentsCompleted > 0;

  return {
    hasActivity,
    context: {
      period: { start, end },
      assignmentsAssigned,
      assignmentsCompleted,
      checkinCount,
      meanScore,
      logCount,
      totalVolume,
      fuelDays,
    },
  };
}

// runWeeklySummary(pool, deps, {now}) -> {users, acted, skipped, errors}
export async function runWeeklySummary(pool, deps, { now = new Date() } = {}) {
  const weekKey = isoWeekKey(now);
  const { rows: users } = await pool.query(`SELECT id FROM users WHERE role = 'user'`);
  const summary = { users: users.length, acted: 0, skipped: 0, errors: 0 };

  for (const { id: userId } of users) {
    const dedupeKey = `${userId}:${weekKey}`;
    try {
      const claim = await pool.query(
        `INSERT INTO job_runs (job_name, dedupe_key, user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [WEEKLY_SUMMARY, dedupeKey, userId]
      );
      if (claim.rowCount === 0) {
        summary.skipped++;
        continue;
      }

      const { hasActivity, context } = await buildWeeklyContext(pool, userId, now);
      if (!hasActivity) {
        await pool.query(`UPDATE job_runs SET result = $1 WHERE job_name = $2 AND dedupe_key = $3`, [
          { skipped: "no activity" },
          WEEKLY_SUMMARY,
          dedupeKey,
        ]);
        continue;
      }

      await deps.generateFromContext(pool, { userId, kind: "weekly", context, triggerId: null });
      await pool.query(`UPDATE job_runs SET result = $1 WHERE job_name = $2 AND dedupe_key = $3`, [
        context,
        WEEKLY_SUMMARY,
        dedupeKey,
      ]);
      summary.acted++;
    } catch (err) {
      if (isConcurrentUserDeleteError(err)) {
        summary.skipped++;
        continue;
      }
      console.error(`${WEEKLY_SUMMARY}: user ${userId} failed: ${err.message}`);
      summary.errors++;
    }
  }

  return summary;
}

// name -> handler, shared by the admin manual-trigger route and scheduler.js.
export const JOB_HANDLERS = {
  [DAILY_MONITOR]: runDailyMonitor,
  [WEEKLY_SUMMARY]: runWeeklySummary,
};
