// server/admin.js — Kyle console admin routes (U5a, ask 30). Every route here
// is gated requireUser + requireAdmin (404 to non-admins — see authz.js).
// This is the ONE place in the app where a user id is accepted from request
// input (URL params / body) rather than derived from the session — allowed
// only because requireAdmin gates the whole router. Every such id is always
// validated to exist before use.
import { Router } from "express";
import { makeRequireUser, requireAdmin } from "./authz.js";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDay(v) {
  return typeof v === "string" && DAY_RE.test(v);
}

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Postgres data-exception (22xxx) / integrity-constraint-violation (23xxx)
// codes -- same convention as data.js: "the caller/param sent us something
// the schema rejects" (including a malformed uuid) reads as 404/400, never 500.
function isDbInputError(err) {
  return typeof err?.code === "string" && (err.code.startsWith("22") || err.code.startsWith("23"));
}

function isValidSet(s) {
  if (!isPlainObject(s)) return false;
  if (!Number.isInteger(s.reps) || s.reps < 1) return false;
  if (s.weight_lbs !== undefined && !(typeof s.weight_lbs === "number" && Number.isFinite(s.weight_lbs) && s.weight_lbs >= 0)) {
    return false;
  }
  if (s.rpe !== undefined && !(typeof s.rpe === "number" && Number.isFinite(s.rpe) && s.rpe >= 1 && s.rpe <= 10)) {
    return false;
  }
  return true;
}

function isValidBlock(b) {
  if (!isPlainObject(b)) return false;
  if (typeof b.exercise_key !== "string" || !b.exercise_key) return false;
  if (!Array.isArray(b.sets) || b.sets.length === 0) return false;
  if (!b.sets.every(isValidSet)) return false;
  if (b.rest_sec !== undefined && !(typeof b.rest_sec === "number" && Number.isFinite(b.rest_sec) && b.rest_sec >= 0)) {
    return false;
  }
  if (b.note !== undefined && typeof b.note !== "string") return false;
  return true;
}

function isValidBlocks(blocks) {
  return Array.isArray(blocks) && blocks.every(isValidBlock);
}

export function createAdminRouter(pool) {
  const router = Router();
  const requireUser = makeRequireUser(pool);

  // GET /admin/users -- MOVED from routes.js (U2 reference route), extended
  // with last_checkin + assignment_count in the same single query (no N+1).
  router.get("/admin/users", requireUser, requireAdmin, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT u.id, u.email, u.name, u.role, u.created_at,
                MAX(c.day) AS last_checkin,
                COUNT(DISTINCT wa.id)::int AS assignment_count
         FROM users u
         LEFT JOIN checkins c ON c.user_id = u.id
         LEFT JOIN workout_assignments wa ON wa.user_id = u.id
         GROUP BY u.id
         ORDER BY u.created_at ASC`
      );
      res.status(200).json(rows);
    } catch (err) {
      console.error(`admin users query error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  // GET /admin/users/:id/overview -- reuses the /api/bootstrap query shapes,
  // scoped by the URL param id (validated to exist first) instead of
  // req.user.id. Still no N+1: one existence check, then a fixed set of
  // queries (5 in parallel + 2 sequential for the last-20-logs' sets and the
  // upcoming/past assignment split).
  router.get("/admin/users/:id/overview", requireUser, requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
      const userResult = await pool.query(`SELECT id, email, name, role FROM users WHERE id = $1`, [id]);
      const user = userResult.rows[0];
      if (!user) return res.status(404).json({ error: "not_found" });

      const [profileResult, checkinsResult, fuelResult, logsResult, upcomingResult, pastResult] =
        await Promise.all([
          pool.query(`SELECT profile FROM users WHERE id = $1`, [id]),
          pool.query(`SELECT day, score, answers FROM checkins WHERE user_id = $1 ORDER BY day ASC`, [id]),
          pool.query(
            `SELECT id, eaten_on, name, calories, protein_g, carbs_g, fat_g, source
             FROM fuel_logs WHERE user_id = $1 ORDER BY eaten_on DESC LIMIT 30`,
            [id]
          ),
          pool.query(
            `SELECT id, performed_at, notes, assignment_id
             FROM workout_logs WHERE user_id = $1 ORDER BY performed_at DESC LIMIT 20`,
            [id]
          ),
          pool.query(
            `SELECT wa.id, wa.scheduled_for, wa.status, w.id AS workout_id, w.title AS workout_title
             FROM workout_assignments wa JOIN workouts w ON w.id = wa.workout_id
             WHERE wa.user_id = $1 AND wa.scheduled_for >= CURRENT_DATE
             ORDER BY wa.scheduled_for ASC`,
            [id]
          ),
          pool.query(
            `SELECT wa.id, wa.scheduled_for, wa.status, w.id AS workout_id, w.title AS workout_title
             FROM workout_assignments wa JOIN workouts w ON w.id = wa.workout_id
             WHERE wa.user_id = $1 AND wa.scheduled_for < CURRENT_DATE
             ORDER BY wa.scheduled_for DESC LIMIT 10`,
            [id]
          ),
        ]);

      const logIds = logsResult.rows.map((l) => l.id);
      const setsResult = logIds.length
        ? await pool.query(
            `SELECT log_id, exercise_key, set_no, reps, weight_lbs, rpe
             FROM workout_log_sets WHERE user_id = $1 AND log_id = ANY($2::uuid[]) ORDER BY log_id ASC, set_no ASC`,
            [id, logIds]
          )
        : { rows: [] };

      const setsByLog = new Map();
      for (const s of setsResult.rows) {
        const arr = setsByLog.get(s.log_id) ?? [];
        arr.push({
          exercise_key: s.exercise_key,
          set_no: s.set_no,
          reps: s.reps,
          weight_lbs: s.weight_lbs,
          rpe: s.rpe,
        });
        setsByLog.set(s.log_id, arr);
      }

      const workoutLogs = logsResult.rows.map((l) => ({
        id: l.id,
        performed_at: l.performed_at,
        notes: l.notes,
        assignment_id: l.assignment_id,
        sets: setsByLog.get(l.id) ?? [],
      }));

      const toAssignment = (a) => ({
        id: a.id,
        scheduled_for: a.scheduled_for,
        status: a.status,
        workout: { id: a.workout_id, title: a.workout_title },
      });

      res.status(200).json({
        user,
        profile: profileResult.rows[0]?.profile ?? {},
        checkins: checkinsResult.rows,
        fuel: fuelResult.rows,
        workoutLogs,
        assignments: [...upcomingResult.rows.map(toAssignment), ...pastResult.rows.map(toAssignment)],
      });
    } catch (err) {
      if (isDbInputError(err)) return res.status(404).json({ error: "not_found" });
      console.error(`admin overview query error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  // POST /admin/workouts {title, notes?, blocks}
  router.post("/admin/workouts", requireUser, requireAdmin, async (req, res) => {
    const { title, notes, blocks } = req.body ?? {};
    if (typeof title !== "string" || !title.trim() || title.length > 120) {
      return res.status(400).json({ error: "invalid workout data" });
    }
    if (notes !== undefined && notes !== null && typeof notes !== "string") {
      return res.status(400).json({ error: "invalid workout data" });
    }
    if (!isValidBlocks(blocks)) {
      return res.status(400).json({ error: "invalid workout data" });
    }

    try {
      // blocks is a JS array -- pg serializes arrays as Postgres array
      // literals by default (not JSON), so it must be stringified explicitly
      // for the jsonb column (unlike a plain object param elsewhere in this
      // codebase, e.g. checkins' `answers`, which pg auto-JSON-serializes).
      const { rows } = await pool.query(
        `INSERT INTO workouts (created_by, title, notes, blocks)
         VALUES ($1, $2, $3, $4)
         RETURNING id, created_by, title, notes, blocks, created_at, updated_at`,
        [req.user.id, title, notes ?? null, JSON.stringify(blocks)]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (isDbInputError(err)) return res.status(400).json({ error: "invalid workout data" });
      console.error(`workout insert error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  // GET /admin/workouts -- the console's "reuse a workout" list.
  router.get("/admin/workouts", requireUser, requireAdmin, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, title, notes, blocks, created_at FROM workouts ORDER BY created_at DESC`
      );
      res.status(200).json(rows);
    } catch (err) {
      console.error(`admin workouts query error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  // POST /admin/assignments {user_id, workout_id, scheduled_for}
  router.post("/admin/assignments", requireUser, requireAdmin, async (req, res) => {
    const { user_id, workout_id, scheduled_for } = req.body ?? {};
    if (typeof user_id !== "string" || !user_id) {
      return res.status(400).json({ error: "invalid assignment data" });
    }
    if (typeof workout_id !== "string" || !workout_id) {
      return res.status(400).json({ error: "invalid assignment data" });
    }
    if (!isValidDay(scheduled_for)) {
      return res.status(400).json({ error: "invalid assignment data" });
    }

    try {
      const [userResult, workoutResult] = await Promise.all([
        pool.query(`SELECT 1 FROM users WHERE id = $1`, [user_id]),
        pool.query(`SELECT 1 FROM workouts WHERE id = $1`, [workout_id]),
      ]);
      if (userResult.rows.length === 0) return res.status(404).json({ error: "user not found" });
      if (workoutResult.rows.length === 0) return res.status(404).json({ error: "workout not found" });
    } catch (err) {
      if (isDbInputError(err)) return res.status(404).json({ error: "not_found" });
      console.error(`assignment existence check error: ${err.message}`);
      return res.status(500).json({ error: "internal_error" });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO workout_assignments (user_id, workout_id, scheduled_for, assigned_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, user_id, workout_id, scheduled_for, status, assigned_by, created_at`,
        [user_id, workout_id, scheduled_for, req.user.id]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === "23505") return res.status(409).json({ error: "assignment already exists" });
      if (isDbInputError(err)) return res.status(400).json({ error: "invalid assignment data" });
      console.error(`assignment insert error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  // PATCH /admin/assignments/:id {status} -- only assigned|skipped accepted;
  // "completed" is reserved for the athlete's own logging flow (later unit).
  router.patch("/admin/assignments/:id", requireUser, requireAdmin, async (req, res) => {
    const { status } = req.body ?? {};
    if (status !== "assigned" && status !== "skipped") {
      return res.status(400).json({ error: "invalid status" });
    }

    try {
      const { rows } = await pool.query(
        `UPDATE workout_assignments SET status = $1 WHERE id = $2
         RETURNING id, user_id, workout_id, scheduled_for, status, assigned_by, created_at`,
        [status, req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: "not_found" });
      res.status(200).json(rows[0]);
    } catch (err) {
      if (isDbInputError(err)) return res.status(404).json({ error: "not_found" });
      console.error(`assignment patch error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  return router;
}
