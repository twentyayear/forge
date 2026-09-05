// server/data.js — user-data routes: bootstrap read, scoped writes for
// checkins/fuel/workout-logs/profile, and the one-shot prototype import.
// Copies the scoping invariant from routes.js: user id ALWAYS from
// req.user.id, never from the request body/params.
import express from "express";
import { Router } from "express";
import { makeRequireUser } from "./authz.js";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const PROFILE_WHITELIST = ["bodyweight", "fuelTargets", "coach", "device"];

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isValidDay(v) {
  return typeof v === "string" && DAY_RE.test(v);
}

function isValidScore(v) {
  return Number.isInteger(v) && v >= 0 && v <= 100;
}

// Postgres data-exception (22xxx) and integrity-constraint-violation (23xxx)
// error codes -- i.e. "the caller sent us something the schema rejects" as
// opposed to a real server fault. Mapped to 400 everywhere in this file.
function isDbInputError(err) {
  return typeof err?.code === "string" && (err.code.startsWith("22") || err.code.startsWith("23"));
}

function whitelistedProfileFields(body) {
  const out = {};
  for (const key of Object.keys(body ?? {})) {
    if (!PROFILE_WHITELIST.includes(key)) return null; // unknown key -> caller rejects
    out[key] = body[key];
  }
  return out;
}

export function createDataRouter(pool) {
  const router = Router();
  const requireUser = makeRequireUser(pool);

  router.get("/bootstrap", requireUser, async (req, res) => {
    try {
      const [profileResult, checkinsResult, fuelResult, logsResult, setsResult, assignmentsResult, unreadResult] =
        await Promise.all([
          pool.query(`SELECT profile FROM users WHERE id = $1`, [req.user.id]),
          pool.query(`SELECT day, score, answers FROM checkins WHERE user_id = $1 ORDER BY day ASC`, [
            req.user.id,
          ]),
          pool.query(
            `SELECT id, eaten_on, name, calories, protein_g, carbs_g, fat_g, source
             FROM fuel_logs WHERE user_id = $1 ORDER BY eaten_on ASC`,
            [req.user.id]
          ),
          pool.query(
            `SELECT id, performed_at, notes, assignment_id
             FROM workout_logs WHERE user_id = $1 ORDER BY performed_at ASC`,
            [req.user.id]
          ),
          pool.query(
            `SELECT log_id, exercise_key, set_no, reps, weight_lbs, rpe
             FROM workout_log_sets WHERE user_id = $1 ORDER BY log_id ASC, set_no ASC`,
            [req.user.id]
          ),
          // assignments: from 7 days ago forward -- lets a just-missed workout
          // still show, without dragging in the user's whole assignment history.
          pool.query(
            `SELECT wa.id, wa.scheduled_for, wa.status,
                    w.id AS workout_id, w.title AS workout_title, w.notes AS workout_notes, w.blocks AS workout_blocks
             FROM workout_assignments wa
             JOIN workouts w ON w.id = wa.workout_id
             WHERE wa.user_id = $1 AND wa.scheduled_for >= CURRENT_DATE - 7
             ORDER BY wa.scheduled_for ASC`,
            [req.user.id]
          ),
          // U6 (ask 32): count of Kyle-sent messages the athlete hasn't read
          // yet, for the Coach nav badge.
          pool.query(
            `SELECT COUNT(*)::int AS n FROM messages WHERE user_id = $1 AND sender = 'kyle' AND read_at IS NULL`,
            [req.user.id]
          ),
        ]);

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

      const assignments = assignmentsResult.rows.map((a) => ({
        id: a.id,
        scheduled_for: a.scheduled_for,
        status: a.status,
        workout: { id: a.workout_id, title: a.workout_title, notes: a.workout_notes, blocks: a.workout_blocks },
      }));

      res.status(200).json({
        user: req.user,
        profile: profileResult.rows[0]?.profile ?? {},
        checkins: checkinsResult.rows,
        fuel: fuelResult.rows,
        workoutLogs,
        assignments,
        unreadMessages: unreadResult.rows[0].n,
      });
    } catch (err) {
      console.error(`bootstrap query error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  router.post("/checkins", requireUser, async (req, res) => {
    const { day, score, answers } = req.body ?? {};
    if (!isValidDay(day)) return res.status(400).json({ error: "invalid day" });
    if (!isValidScore(score)) return res.status(400).json({ error: "invalid score" });
    if (!isPlainObject(answers)) return res.status(400).json({ error: "invalid answers" });

    try {
      const { rows } = await pool.query(
        `INSERT INTO checkins (user_id, day, score, answers)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, day) DO UPDATE SET score = EXCLUDED.score, answers = EXCLUDED.answers, updated_at = now()
         RETURNING id, day, score, answers, created_at, updated_at`,
        [req.user.id, day, score, answers]
      );
      res.status(200).json(rows[0]);
    } catch (err) {
      if (isDbInputError(err)) return res.status(400).json({ error: "invalid checkin data" });
      console.error(`checkin upsert error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  router.post("/fuel-logs", requireUser, async (req, res) => {
    const { eaten_on, name, calories, protein_g, carbs_g, fat_g, source, raw } = req.body ?? {};
    if (typeof eaten_on !== "string" || !eaten_on) {
      return res.status(400).json({ error: "invalid fuel log data" });
    }
    if (typeof name !== "string" || !name) {
      return res.status(400).json({ error: "invalid fuel log data" });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO fuel_logs (user_id, eaten_on, name, calories, protein_g, carbs_g, fat_g, source, raw)
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'search'), $9)
         RETURNING id, eaten_on, name, calories, protein_g, carbs_g, fat_g, source, raw, created_at`,
        [
          req.user.id,
          eaten_on,
          name,
          calories ?? null,
          protein_g ?? null,
          carbs_g ?? null,
          fat_g ?? null,
          source ?? null,
          raw ?? null,
        ]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (isDbInputError(err)) return res.status(400).json({ error: "invalid fuel log data" });
      console.error(`fuel log insert error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  router.delete("/fuel-logs/:id", requireUser, async (req, res) => {
    try {
      const { rowCount } = await pool.query(`DELETE FROM fuel_logs WHERE id = $1 AND user_id = $2`, [
        req.params.id,
        req.user.id,
      ]);
      if (rowCount === 0) return res.status(404).json({ error: "not_found" });
      res.status(200).json({ ok: true });
    } catch (err) {
      // Malformed uuid (22P02) reads the same as "no such row" to the caller.
      if (isDbInputError(err)) return res.status(404).json({ error: "not_found" });
      console.error(`fuel log delete error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  router.post("/workout-logs", requireUser, async (req, res) => {
    const { performed_at, notes, assignment_id, sets } = req.body ?? {};
    if (typeof performed_at !== "string" || Number.isNaN(Date.parse(performed_at))) {
      return res.status(400).json({ error: "invalid performed_at" });
    }
    if (!Array.isArray(sets)) {
      return res.status(400).json({ error: "invalid sets" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows: logRows } = await client.query(
        `INSERT INTO workout_logs (user_id, assignment_id, performed_at, notes)
         VALUES ($1, $2, $3, $4)
         RETURNING id, performed_at, notes, assignment_id`,
        [req.user.id, assignment_id ?? null, performed_at, notes ?? null]
      );
      const log = logRows[0];

      const insertedSets = [];
      for (const s of sets) {
        const { rows: setRows } = await client.query(
          `INSERT INTO workout_log_sets (user_id, log_id, exercise_key, set_no, reps, weight_lbs, rpe)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING exercise_key, set_no, reps, weight_lbs, rpe`,
          [req.user.id, log.id, s?.exercise_key, s?.set_no, s?.reps, s?.weight_lbs ?? null, s?.rpe ?? null]
        );
        insertedSets.push(setRows[0]);
      }

      // Logging a session against an assignment marks it done -- same
      // transaction so a set-insert failure never leaves the assignment
      // flipped without the log that justified it (or vice versa).
      if (assignment_id) {
        await client.query(
          `UPDATE workout_assignments SET status = 'completed' WHERE id = $1 AND user_id = $2`,
          [assignment_id, req.user.id]
        );
      }

      await client.query("COMMIT");
      res.status(201).json({ ...log, sets: insertedSets });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      if (isDbInputError(err)) return res.status(400).json({ error: "invalid workout log data" });
      console.error(`workout log insert error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    } finally {
      client.release();
    }
  });

  router.patch("/profile", requireUser, async (req, res) => {
    const fields = whitelistedProfileFields(req.body);
    if (fields === null || Object.keys(fields).length === 0) {
      return res.status(400).json({ error: "invalid profile fields" });
    }

    try {
      const { rows } = await pool.query(
        `UPDATE users SET profile = profile || $1::jsonb WHERE id = $2 RETURNING profile`,
        [fields, req.user.id]
      );
      res.status(200).json(rows[0].profile);
    } catch (err) {
      console.error(`profile patch error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  // POST /import — the one-shot prototype localStorage migration. Parses its
  // own body with a raised 2mb limit (a full dump can exceed the app-wide
  // 100kb default); requireUser runs first so an unauthenticated request
  // never pays for parsing an oversized body. See app.js for the matching
  // skip of the global json() parser on this one path.
  router.post("/import", requireUser, express.json({ limit: "2mb" }), async (req, res) => {
    const body = req.body ?? {};
    const { checkins, fuelLog, bodyweight, fuelTargets, coach, device } = body;

    try {
      const [existingCheckins, existingFuel] = await Promise.all([
        pool.query(`SELECT 1 FROM checkins WHERE user_id = $1 LIMIT 1`, [req.user.id]),
        pool.query(`SELECT 1 FROM fuel_logs WHERE user_id = $1 LIMIT 1`, [req.user.id]),
      ]);
      if (existingCheckins.rows.length > 0 || existingFuel.rows.length > 0) {
        return res.status(409).json({ error: "account already has data" });
      }
    } catch (err) {
      console.error(`import pre-check error: ${err.message}`);
      return res.status(500).json({ error: "internal_error" });
    }

    const profileUpdate = {};
    for (const [key, val] of Object.entries({ bodyweight, fuelTargets, coach, device })) {
      if (val !== undefined) profileUpdate[key] = val;
    }

    const client = await pool.connect();
    let checkinsInserted = 0;
    let fuelInserted = 0;
    let skipped = 0;

    try {
      await client.query("BEGIN");

      if (isPlainObject(checkins)) {
        for (const [day, entry] of Object.entries(checkins)) {
          const score = entry?.score;
          const answers = entry?.answers;
          if (!isValidDay(day) || !isValidScore(score) || !isPlainObject(answers)) {
            skipped++;
            continue;
          }
          await client.query(
            `INSERT INTO checkins (user_id, day, score, answers)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, day) DO UPDATE SET score = EXCLUDED.score, answers = EXCLUDED.answers, updated_at = now()`,
            [req.user.id, day, score, answers]
          );
          checkinsInserted++;
        }
      }

      if (isPlainObject(fuelLog)) {
        for (const [day, entries] of Object.entries(fuelLog)) {
          if (!Array.isArray(entries)) {
            skipped++;
            continue;
          }
          for (const entry of entries) {
            if (!isPlainObject(entry) || typeof entry.name !== "string" || !entry.name) {
              skipped++;
              continue;
            }
            const raw = entry.brand ? { brand: entry.brand } : null;
            await client.query(
              `INSERT INTO fuel_logs (user_id, eaten_on, name, calories, protein_g, carbs_g, fat_g, source, raw)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'custom', $8)`,
              [
                req.user.id,
                day,
                entry.name,
                entry.kcal != null ? Math.round(entry.kcal) : null,
                entry.protein != null ? Math.round(entry.protein) : null,
                entry.carbs != null ? Math.round(entry.carbs) : null,
                entry.fat != null ? Math.round(entry.fat) : null,
                raw,
              ]
            );
            fuelInserted++;
          }
        }
      }

      let profile;
      if (Object.keys(profileUpdate).length > 0) {
        const { rows } = await client.query(
          `UPDATE users SET profile = profile || $1::jsonb WHERE id = $2 RETURNING profile`,
          [profileUpdate, req.user.id]
        );
        profile = rows[0].profile;
      } else {
        const { rows } = await client.query(`SELECT profile FROM users WHERE id = $1`, [req.user.id]);
        profile = rows[0].profile;
      }

      await client.query("COMMIT");
      res.status(200).json({ imported: { checkins: checkinsInserted, fuel: fuelInserted, skipped }, profile });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(`import error: ${err.message}`);
      res.status(400).json({ error: "import failed" });
    } finally {
      client.release();
    }
  });

  return router;
}
