// SERVER/ACHIEVEMENTS.JS: THE ONE ACHIEVEMENT REGISTRY.
// EVALUATE(CTX) IS PURE; EVALUATEANDRECORD MUST RUN INSIDE THE WRITE'S OWN TRANSACTION.
import { sessionStreak, checkinStreak, isoWeekKey, epley } from "./streaks.js";

function isLog(ctx) {
  return ctx.kind === "workout_log";
}

function prExercise(ctx) {
  if (!isLog(ctx) || !ctx.log) return null;
  for (const s of ctx.log.sets) {
    if (!(Number(s.weight_lbs) > 0)) continue;
    const prior = ctx.priorBest.get(s.exercise_key);
    if (prior !== undefined && epley(Number(s.weight_lbs), s.reps) > prior) return s.exercise_key;
  }
  return null;
}

function weekOf(ctx) {
  return ctx.assignment ? isoWeekKey(ctx.assignment.scheduled_for) : null;
}

export const ACHIEVEMENTS = [
  {
    id: "first_session",
    title: "First session",
    blurb: "You showed up. That is the whole game.",
    dedupe: () => "once",
    evaluate: (ctx) => isLog(ctx) && ctx.logCount === 1,
  },
  {
    id: "streak_3",
    title: "Three straight",
    blurb: "Three assigned days in a row, done.",
    dedupe: () => "once",
    evaluate: (ctx) => isLog(ctx) && sessionStreak(ctx.assignments, ctx.today) >= 3,
  },
  {
    id: "streak_7",
    title: "Seven straight",
    blurb: "A full week without a miss.",
    dedupe: () => "once",
    evaluate: (ctx) => isLog(ctx) && sessionStreak(ctx.assignments, ctx.today) >= 7,
  },
  {
    id: "week_complete",
    title: "Week complete",
    blurb: "Every session Kyle set this week.",
    dedupe: (ctx) => weekOf(ctx),
    context: (ctx) => ({ week: weekOf(ctx) }),
    evaluate: (ctx) => {
      if (!isLog(ctx) || !ctx.assignment) return false;
      const week = weekOf(ctx);
      const inWeek = ctx.assignments.filter((a) => a.scheduled_for <= ctx.today && isoWeekKey(a.scheduled_for) === week);
      return inWeek.length >= 2 && inWeek.every((a) => a.status === "completed");
    },
  },
  {
    id: "new_pr",
    title: "New record",
    blurb: "A new best on <exercise>.",
    dedupe: (ctx) => prExercise(ctx),
    context: (ctx) => ({ exercise: prExercise(ctx) }),
    evaluate: (ctx) => prExercise(ctx) !== null,
  },
  {
    id: "volume_10k",
    title: "Ten thousand",
    blurb: "10,000 lb moved in one session.",
    dedupe: () => "once",
    evaluate: (ctx) =>
      isLog(ctx) && !!ctx.log && ctx.log.sets.reduce((sum, s) => sum + s.reps * Number(s.weight_lbs ?? 0), 0) >= 10000,
  },
  {
    id: "checkin_streak_7",
    title: "Seven mornings",
    blurb: "Checked in seven days running.",
    dedupe: () => "once",
    evaluate: (ctx) => ctx.kind === "checkin" && checkinStreak(ctx.checkinDays, ctx.today) >= 7,
  },
  {
    id: "program_complete",
    title: "Program complete",
    blurb: "Every day of <program>, done.",
    dedupe: (ctx) => ctx.enrollment.id,
    context: (ctx) => ({ program: ctx.enrollment.title }),
    evaluate: (ctx) => isLog(ctx) && !!ctx.enrollment && ctx.enrollment.completed === ctx.enrollment.total,
  },
];

export async function evaluateAndRecord(client, userId, ctx) {
  const earned = [];
  for (const a of ACHIEVEMENTS) {
    let key;
    let context;
    // A THROWING RULE IS LOGGED AND SKIPPED; IT MUST NEVER FAIL THE WRITE.
    try {
      if (!a.evaluate(ctx)) continue;
      key = a.dedupe(ctx);
      context = a.context ? a.context(ctx) : {};
    } catch (err) {
      console.error(`achievement ${a.id} error: ${err.message}`);
      continue;
    }
    // ON CONFLICT DO NOTHING ON THE PRIMARY KEY MAKES A REPLAY EARN NOTHING, SO ONLY NEWLY INSERTED ROWS ARE REPORTED.
    const { rows } = await client.query(
      `INSERT INTO user_achievements (user_id, achievement_id, dedupe_key, context)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING
       RETURNING achievement_id, dedupe_key`,
      [userId, a.id, key, context]
    );
    if (rows.length > 0) earned.push({ id: a.id, title: a.title, blurb: a.blurb, context });
  }
  return earned;
}

export async function loadContext(client, userId, { kind, logId, assignmentId, today }) {
  const ctx = {
    kind,
    today,
    assignments: [],
    priorBest: new Map(),
    logCount: 0,
    checkinDays: [],
  };

  const { rows: assignments } = await client.query(
    `SELECT id, scheduled_for::text AS scheduled_for, status, program_enrollment_id
     FROM workout_assignments WHERE user_id = $1`,
    [userId]
  );
  ctx.assignments = assignments;

  const { rows: checkins } = await client.query(
    `SELECT day::text AS day FROM checkins WHERE user_id = $1 ORDER BY day ASC`,
    [userId]
  );
  ctx.checkinDays = checkins.map((r) => r.day);

  if (kind !== "workout_log") return ctx;

  const { rows: sets } = await client.query(
    `SELECT exercise_key, reps, weight_lbs FROM workout_log_sets WHERE user_id = $1 AND log_id = $2 ORDER BY set_no ASC`,
    [userId, logId]
  );
  ctx.log = { id: logId, assignment_id: assignmentId, sets };

  const { rows: best } = await client.query(
    `SELECT exercise_key, MAX(weight_lbs * (1 + reps / 30.0))::float8 AS best
     FROM workout_log_sets
     WHERE user_id = $1 AND log_id <> $2 AND weight_lbs > 0
     GROUP BY exercise_key`,
    [userId, logId]
  );
  for (const r of best) ctx.priorBest.set(r.exercise_key, r.best);

  const { rows: count } = await client.query(`SELECT COUNT(*)::int AS n FROM workout_logs WHERE user_id = $1`, [userId]);
  ctx.logCount = count[0].n;

  const assignment = assignmentId ? assignments.find((a) => a.id === assignmentId) : null;
  if (assignment) {
    ctx.assignment = assignment;
    if (assignment.program_enrollment_id) {
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE wa.status = 'completed')::int AS completed,
                (SELECT p.title FROM program_enrollments pe JOIN programs p ON p.id = pe.program_id
                 WHERE pe.id = $2 AND pe.user_id = $1) AS title
         FROM workout_assignments wa
         WHERE wa.user_id = $1 AND wa.program_enrollment_id = $2`,
        [userId, assignment.program_enrollment_id]
      );
      ctx.enrollment = { id: assignment.program_enrollment_id, ...rows[0] };
    }
  }
  return ctx;
}
