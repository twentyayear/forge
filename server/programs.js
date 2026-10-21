// server/programs.js -- W.2: programs (ordered day lists, some rest), enrolment
// of many clients, bulk assign, and the trainer's calendar read. Every route is
// requireUser + requireAdmin and scoped by the session's user id; client ids in
// a body are only ever the list being acted on and are verified against
// trainer_id = req.user.id before the first write.
import { Router } from "express";
import { makeRequireUser, requireAdmin } from "./authz.js";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DAYS = 366;
const MAX_ENROLL = 50;
const MAX_CALENDAR_SPAN_DAYS = 62;
const MS_PER_DAY = 86400000;

// A REAL CALENDAR DATE: THE REGEX ALONE WOULD LET 2026-02-31 THROUGH.
function isRealDate(v) {
  if (typeof v !== "string" || !DAY_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function isUuid(v) {
  return typeof v === "string" && UUID_RE.test(v);
}

// RETURNS THE NORMALISED DAY LIST, OR null WHEN ANY DAY IS INVALID.
function normaliseDays(days) {
  if (!Array.isArray(days) || days.length > MAX_DAYS) return null;
  const seen = new Set();
  const out = [];
  for (const d of days) {
    if (typeof d !== "object" || d === null || Array.isArray(d)) return null;
    if (!Number.isInteger(d.day_index) || d.day_index < 0 || d.day_index > 365) return null;
    if (seen.has(d.day_index)) return null;
    seen.add(d.day_index);
    const workoutId = d.workout_id ?? null;
    if (workoutId !== null && !isUuid(workoutId)) return null;
    if (d.note !== undefined && d.note !== null && (typeof d.note !== "string" || d.note.length > 500)) return null;
    out.push({ day_index: d.day_index, workout_id: workoutId, note: d.note ?? null });
  }
  return out;
}

function validTitle(t) {
  return typeof t === "string" && t.length >= 1 && t.length <= 120;
}

function validDescription(d) {
  return d === undefined || d === null || typeof d === "string";
}

function isDbInputError(err) {
  return typeof err?.code === "string" && (err.code.startsWith("22") || err.code.startsWith("23"));
}

// DISTINCT UUID LIST OF 1..max ENTRIES, OR null.
function normaliseIds(ids, max) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > max) return null;
  if (!ids.every(isUuid)) return null;
  const lower = ids.map((i) => i.toLowerCase());
  if (new Set(lower).size !== lower.length) return null;
  return lower;
}

export function createProgramsRouter(pool) {
  const router = Router();
  const requireUser = makeRequireUser(pool);

  async function allWorkoutsOwned(db, trainerId, days) {
    const ids = [...new Set(days.map((d) => d.workout_id).filter(Boolean))];
    if (ids.length === 0) return true;
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM workouts WHERE id = ANY($1::uuid[]) AND created_by = $2`,
      [ids, trainerId]
    );
    return rows[0].n === ids.length;
  }

  async function loadProgram(db, id, trainerId) {
    const { rows } = await db.query(
      `SELECT id, title, description, created_at FROM programs WHERE id = $1 AND trainer_id = $2`,
      [id, trainerId]
    );
    const program = rows[0];
    if (!program) return null;
    const [days, enrollments] = await Promise.all([
      db.query(
        `SELECT pd.day_index, pd.workout_id, w.title AS workout_title, pd.note
         FROM program_days pd LEFT JOIN workouts w ON w.id = pd.workout_id
         WHERE pd.program_id = $1 ORDER BY pd.day_index ASC`,
        [id]
      ),
      db.query(
        `SELECT pe.user_id, u.name AS user_name, to_char(pe.start_date, 'YYYY-MM-DD') AS start_date
         FROM program_enrollments pe JOIN users u ON u.id = pe.user_id
         WHERE pe.program_id = $1 ORDER BY pe.start_date ASC, u.name ASC`,
        [id]
      ),
    ]);
    return { ...program, days: days.rows, enrollments: enrollments.rows };
  }

  async function insertDays(client, programId, days) {
    for (const d of days) {
      await client.query(
        `INSERT INTO program_days (program_id, day_index, workout_id, note) VALUES ($1, $2, $3, $4)`,
        [programId, d.day_index, d.workout_id, d.note]
      );
    }
  }

  // POST /admin/programs
  router.post("/admin/programs", requireUser, requireAdmin, async (req, res) => {
    const { title, description, days } = req.body ?? {};
    const normalised = normaliseDays(days);
    if (!validTitle(title) || !validDescription(description) || !normalised) {
      return res.status(400).json({ error: "invalid_body" });
    }
    const client = await pool.connect();
    try {
      if (!(await allWorkoutsOwned(client, req.user.id, normalised))) {
        return res.status(404).json({ error: "not_found" });
      }
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO programs (trainer_id, title, description) VALUES ($1, $2, $3) RETURNING id`,
        [req.user.id, title, description ?? null]
      );
      await insertDays(client, rows[0].id, normalised);
      const program = await loadProgram(client, rows[0].id, req.user.id);
      await client.query("COMMIT");
      res.status(201).json(program);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      if (isDbInputError(err)) return res.status(400).json({ error: "invalid_body" });
      console.error(`program create error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    } finally {
      client.release();
    }
  });

  // GET /admin/programs
  router.get("/admin/programs", requireUser, requireAdmin, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT p.id, p.title, p.description,
                (SELECT count(*)::int FROM program_days pd WHERE pd.program_id = p.id) AS day_count,
                (SELECT count(*)::int FROM program_days pd WHERE pd.program_id = p.id AND pd.workout_id IS NOT NULL) AS session_count,
                (SELECT count(*)::int FROM program_enrollments pe WHERE pe.program_id = p.id) AS enrollment_count,
                p.created_at
         FROM programs p WHERE p.trainer_id = $1 ORDER BY p.created_at DESC, p.id DESC`,
        [req.user.id]
      );
      res.status(200).json(rows);
    } catch (err) {
      console.error(`programs list error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  // GET /admin/programs/:id
  router.get("/admin/programs/:id", requireUser, requireAdmin, async (req, res) => {
    if (!isUuid(req.params.id)) return res.status(404).json({ error: "not_found" });
    try {
      const program = await loadProgram(pool, req.params.id, req.user.id);
      if (!program) return res.status(404).json({ error: "not_found" });
      res.status(200).json(program);
    } catch (err) {
      console.error(`program get error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  // PATCH /admin/programs/:id
  router.patch("/admin/programs/:id", requireUser, requireAdmin, async (req, res) => {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(404).json({ error: "not_found" });
    const { title, description, days } = req.body ?? {};
    if (title !== undefined && !validTitle(title)) return res.status(400).json({ error: "invalid_body" });
    if (!validDescription(description)) return res.status(400).json({ error: "invalid_body" });
    let normalised;
    if (days !== undefined) {
      normalised = normaliseDays(days);
      if (!normalised) return res.status(400).json({ error: "invalid_body" });
    }
    const client = await pool.connect();
    try {
      const owned = await client.query(`SELECT 1 FROM programs WHERE id = $1 AND trainer_id = $2`, [id, req.user.id]);
      if (owned.rows.length === 0) return res.status(404).json({ error: "not_found" });
      if (normalised && !(await allWorkoutsOwned(client, req.user.id, normalised))) {
        return res.status(404).json({ error: "not_found" });
      }
      await client.query("BEGIN");
      await client.query(
        `UPDATE programs SET title = COALESCE($3, title),
                description = CASE WHEN $4::boolean THEN $5 ELSE description END,
                updated_at = now()
         WHERE id = $1 AND trainer_id = $2`,
        [id, req.user.id, title ?? null, description !== undefined, description ?? null]
      );
      if (normalised) {
        await client.query(`DELETE FROM program_days WHERE program_id = $1`, [id]);
        await insertDays(client, id, normalised);
      }
      const program = await loadProgram(client, id, req.user.id);
      await client.query("COMMIT");
      res.status(200).json(program);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      if (isDbInputError(err)) return res.status(400).json({ error: "invalid_body" });
      console.error(`program patch error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    } finally {
      client.release();
    }
  });

  // DELETE /admin/programs/:id
  router.delete("/admin/programs/:id", requireUser, requireAdmin, async (req, res) => {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(404).json({ error: "not_found" });
    try {
      const owned = await pool.query(`SELECT 1 FROM programs WHERE id = $1 AND trainer_id = $2`, [id, req.user.id]);
      if (owned.rows.length === 0) return res.status(404).json({ error: "not_found" });
      const enr = await pool.query(`SELECT 1 FROM program_enrollments WHERE program_id = $1 LIMIT 1`, [id]);
      if (enr.rows.length > 0) return res.status(409).json({ error: "has_enrollments" });
      await pool.query(`DELETE FROM programs WHERE id = $1 AND trainer_id = $2`, [id, req.user.id]);
      res.status(204).end();
    } catch (err) {
      // THE FK VIOLATION CATCH COVERS AN ENROLMENT THAT LANDED AFTER THE PRE-CHECK; SAME RESPONSE EITHER WAY.
      if (err.code === "23503") return res.status(409).json({ error: "has_enrollments" });
      console.error(`program delete error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  // POST /admin/programs/:id/enroll
  router.post("/admin/programs/:id/enroll", requireUser, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { user_ids, start_date } = req.body ?? {};
    const ids = normaliseIds(user_ids, MAX_ENROLL);
    if (!ids || !isRealDate(start_date)) return res.status(400).json({ error: "invalid_body" });
    if (!isUuid(id)) return res.status(404).json({ error: "not_found" });
    const client = await pool.connect();
    try {
      const owned = await client.query(`SELECT 1 FROM programs WHERE id = $1 AND trainer_id = $2`, [id, req.user.id]);
      if (owned.rows.length === 0) return res.status(404).json({ error: "not_found" });
      const users = await client.query(
        `SELECT count(*)::int AS n FROM users WHERE id = ANY($1::uuid[]) AND trainer_id = $2`,
        [ids, req.user.id]
      );
      if (users.rows[0].n !== ids.length) return res.status(404).json({ error: "not_found" });

      await client.query("BEGIN");
      const days = await client.query(
        `SELECT day_index, workout_id FROM program_days WHERE program_id = $1 AND workout_id IS NOT NULL ORDER BY day_index`,
        [id]
      );
      const enrolled = [];
      const skipped = [];
      let created = 0;
      for (const userId of ids) {
        // CONFLICT ON (program, user, start date) MEANS ALREADY ENROLLED FROM THAT DATE: NOTHING IS WRITTEN FOR THEM.
        const enr = await client.query(
          `INSERT INTO program_enrollments (program_id, user_id, start_date) VALUES ($1, $2, $3)
           ON CONFLICT (program_id, user_id, start_date) DO NOTHING RETURNING id`,
          [id, userId, start_date]
        );
        if (enr.rows.length === 0) {
          skipped.push(userId);
          continue;
        }
        enrolled.push(userId);
        for (const d of days.rows) {
          // CONFLICT TARGET IS THE EXISTING (user, workout, date) KEY SO A HAND-MADE ASSIGNMENT OF THE SAME WORKOUT ON THAT DAY IS KEPT, NOT DUPLICATED.
          const ins = await client.query(
            `INSERT INTO workout_assignments (user_id, workout_id, scheduled_for, assigned_by, program_enrollment_id)
             VALUES ($1, $2, $3::date + $4::int, $5, $6)
             ON CONFLICT (user_id, workout_id, scheduled_for) DO NOTHING`,
            [userId, d.workout_id, start_date, d.day_index, req.user.id, enr.rows[0].id]
          );
          created += ins.rowCount;
        }
      }
      await client.query("COMMIT");
      res.status(200).json({ enrolled, skipped, assignments_created: created });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      if (isDbInputError(err)) return res.status(400).json({ error: "invalid_body" });
      console.error(`program enroll error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    } finally {
      client.release();
    }
  });

  // POST /admin/assignments/bulk
  router.post("/admin/assignments/bulk", requireUser, requireAdmin, async (req, res) => {
    const { workout_id, user_ids, scheduled_for } = req.body ?? {};
    const ids = normaliseIds(user_ids, MAX_ENROLL);
    if (!ids || !isUuid(workout_id) || !isRealDate(scheduled_for)) {
      return res.status(400).json({ error: "invalid_body" });
    }
    const client = await pool.connect();
    try {
      const [w, users] = await Promise.all([
        client.query(`SELECT 1 FROM workouts WHERE id = $1 AND created_by = $2`, [workout_id, req.user.id]),
        client.query(`SELECT count(*)::int AS n FROM users WHERE id = ANY($1::uuid[]) AND trainer_id = $2`, [ids, req.user.id]),
      ]);
      if (w.rows.length === 0 || users.rows[0].n !== ids.length) return res.status(404).json({ error: "not_found" });

      await client.query("BEGIN");
      const created = [];
      const skipped = [];
      for (const userId of ids) {
        // SAME CONFLICT TARGET AS ENROLMENT: AN EXISTING (user, workout, date) ROW IS SKIPPED, NEVER DUPLICATED OR OVERWRITTEN.
        const ins = await client.query(
          `INSERT INTO workout_assignments (user_id, workout_id, scheduled_for, assigned_by)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, workout_id, scheduled_for) DO NOTHING`,
          [userId, workout_id, scheduled_for, req.user.id]
        );
        (ins.rowCount === 1 ? created : skipped).push(userId);
      }
      await client.query("COMMIT");
      res.status(200).json({ created, skipped });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      if (isDbInputError(err)) return res.status(400).json({ error: "invalid_body" });
      console.error(`bulk assign error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    } finally {
      client.release();
    }
  });

  // GET /admin/calendar?from=&to=
  router.get("/admin/calendar", requireUser, requireAdmin, async (req, res) => {
    const { from, to } = req.query;
    if (!isRealDate(from) || !isRealDate(to)) return res.status(400).json({ error: "invalid_query" });
    const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY;
    if (span < 0 || span > MAX_CALENDAR_SPAN_DAYS) return res.status(400).json({ error: "invalid_query" });
    try {
      const { rows } = await pool.query(
        `SELECT wa.id, wa.user_id, u.name AS user_name, to_char(wa.scheduled_for, 'YYYY-MM-DD') AS scheduled_for,
                wa.status, wa.workout_id, w.title AS workout_title, p.title AS program_title
         FROM workout_assignments wa
         JOIN users u ON u.id = wa.user_id AND u.trainer_id = $1
         JOIN workouts w ON w.id = wa.workout_id
         LEFT JOIN program_enrollments pe ON pe.id = wa.program_enrollment_id
         LEFT JOIN programs p ON p.id = pe.program_id
         WHERE wa.scheduled_for BETWEEN $2::date AND $3::date
         ORDER BY wa.scheduled_for ASC, u.name ASC, wa.id ASC`,
        [req.user.id, from, to]
      );
      res.status(200).json(rows);
    } catch (err) {
      console.error(`calendar query error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  return router;
}
