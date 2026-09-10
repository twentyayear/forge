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

const MAX_DRAFT_BODY_LEN = 2000;

// U7 (ask 33): trigger_type -> a one-line context summary for the console
// ("Check-in · score 48" / "Workout · <title> · N sets" / "Manual").
function draftTriggerSummary(row) {
  if (row.trigger_type === "checkin") return `Check-in · score ${row.checkin_score}`;
  if (row.trigger_type === "workout_log") {
    const title = row.workout_title || "Freeform workout";
    const n = row.workout_set_count ?? 0;
    return `Workout · ${title} · ${n} set${n === 1 ? "" : "s"}`;
  }
  return "Manual";
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

  // ---- AI Kyle drafts (U7, ask 33) ----

  // GET /admin/drafts -- pending drafts, oldest first, each with the athlete's
  // name/email, trigger type, created_at, and a one-line trigger context
  // summary (joins checkins/workout_logs by trigger_id, matched by trigger_type
  // so the join only ever hits one side).
  router.get("/admin/drafts", requireUser, requireAdmin, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT d.id, d.trigger_type, d.trigger_id, d.body, d.created_at,
                u.id AS user_id, u.name AS user_name, u.email AS user_email,
                c.score AS checkin_score,
                w.title AS workout_title,
                (SELECT COUNT(*)::int FROM workout_log_sets s WHERE s.log_id = d.trigger_id) AS workout_set_count
         FROM ai_drafts d
         JOIN users u ON u.id = d.user_id
         LEFT JOIN checkins c ON d.trigger_type = 'checkin' AND c.id = d.trigger_id
         LEFT JOIN workout_logs wl ON d.trigger_type = 'workout_log' AND wl.id = d.trigger_id
         LEFT JOIN workout_assignments wa ON wa.id = wl.assignment_id
         LEFT JOIN workouts w ON w.id = wa.workout_id
         WHERE d.status = 'pending'
         ORDER BY d.created_at ASC`
      );
      const drafts = rows.map((r) => ({
        id: r.id,
        trigger_type: r.trigger_type,
        body: r.body,
        created_at: r.created_at,
        user: { id: r.user_id, name: r.user_name, email: r.user_email },
        trigger_summary: draftTriggerSummary(r),
      }));
      res.status(200).json(drafts);
    } catch (err) {
      console.error(`admin drafts query error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  // PATCH /admin/drafts/:id {body} -- edit a pending draft's body. 404 unless pending.
  router.patch("/admin/drafts/:id", requireUser, requireAdmin, async (req, res) => {
    const raw = req.body?.body;
    const body = typeof raw === "string" ? raw.trim() : "";
    if (!body || body.length > MAX_DRAFT_BODY_LEN) {
      return res.status(400).json({ error: "invalid draft body" });
    }
    try {
      const { rows } = await pool.query(
        `UPDATE ai_drafts SET body = $1 WHERE id = $2 AND status = 'pending'
         RETURNING id, trigger_type, trigger_id, body, status, created_at`,
        [body, req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: "not_found" });
      res.status(200).json(rows[0]);
    } catch (err) {
      if (isDbInputError(err)) return res.status(404).json({ error: "not_found" });
      console.error(`draft patch error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  // POST /admin/drafts/:id/approve -- one transaction: insert the kyle
  // message (ai_generated true, body = the draft's CURRENT body, so an edit
  // just before approving is honored), draft -> sent + sent_message_id.
  // 404 unless pending. Returns the message row.
  router.post("/admin/drafts/:id/approve", requireUser, requireAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: draftRows } = await client.query(
        `SELECT id, user_id, body FROM ai_drafts WHERE id = $1 AND status = 'pending' FOR UPDATE`,
        [req.params.id]
      );
      if (draftRows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "not_found" });
      }
      const draft = draftRows[0];
      const { rows: msgRows } = await client.query(
        `INSERT INTO messages (user_id, sender, body, ai_generated)
         VALUES ($1, 'kyle', $2, true)
         RETURNING id, sender, body, ai_generated, created_at`,
        [draft.user_id, draft.body]
      );
      await client.query(
        `UPDATE ai_drafts SET status = 'sent', sent_message_id = $1, decided_at = now() WHERE id = $2`,
        [msgRows[0].id, draft.id]
      );
      await client.query("COMMIT");
      res.status(200).json(msgRows[0]);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      if (isDbInputError(err)) return res.status(404).json({ error: "not_found" });
      console.error(`draft approve error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    } finally {
      client.release();
    }
  });

  // POST /admin/drafts/:id/reject -- 404 unless pending.
  router.post("/admin/drafts/:id/reject", requireUser, requireAdmin, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `UPDATE ai_drafts SET status = 'rejected', decided_at = now() WHERE id = $1 AND status = 'pending'
         RETURNING id, trigger_type, trigger_id, status, decided_at`,
        [req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: "not_found" });
      res.status(200).json(rows[0]);
    } catch (err) {
      if (isDbInputError(err)) return res.status(404).json({ error: "not_found" });
      console.error(`draft reject error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  // PATCH /admin/users/:id/settings {kyleAutoSend: boolean} -- accepts ONLY
  // this one key (400 otherwise); merges into users.profile the same way
  // data.js's /profile route does for athlete-writable fields.
  router.patch("/admin/users/:id/settings", requireUser, requireAdmin, async (req, res) => {
    const body = req.body ?? {};
    const keys = Object.keys(body);
    if (keys.length !== 1 || keys[0] !== "kyleAutoSend" || typeof body.kyleAutoSend !== "boolean") {
      return res.status(400).json({ error: "invalid settings" });
    }
    try {
      const { rows } = await pool.query(
        `UPDATE users SET profile = profile || $1::jsonb WHERE id = $2 RETURNING profile`,
        [{ kyleAutoSend: body.kyleAutoSend }, req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: "not_found" });
      res.status(200).json(rows[0].profile);
    } catch (err) {
      if (isDbInputError(err)) return res.status(404).json({ error: "not_found" });
      console.error(`admin settings patch error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  return router;
}
