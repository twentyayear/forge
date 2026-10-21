// server/coach.js -- W.3: one Kyle line after each exercise and at the finish.
// Claude writes it from the athlete's real numbers; the line is stored so a
// repeat returns the same words; a Claude failure answers from the bank.
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { makeRequireUser } from "./authz.js";
import { callClaude, COACH_LINE_PROMPT } from "./ai.js";
import { outcomeFor, bankLine, clampLine } from "./coach-bank.js";

const COACH_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const isNum = (v, min, max) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const nullOr = (v, check) => v === null || v === undefined || check(v);

function validSet(s) {
  return (
    s !== null &&
    typeof s === "object" &&
    isInt(s.set_no, 1, 1000) &&
    isInt(s.reps, 0, 200) &&
    nullOr(s.weight_lbs, (v) => isNum(v, 0, 2000)) &&
    nullOr(s.target_reps, (v) => isInt(v, 0, 200)) &&
    nullOr(s.target_weight_lbs, (v) => isNum(v, 0, 2000))
  );
}

function parseBody(body) {
  const { assignment_id, exercise_key, kind, sets } = body ?? {};
  if (typeof assignment_id !== "string" || !UUID_RE.test(assignment_id)) return null;
  if (kind !== "exercise" && kind !== "finish") return null;
  if (kind === "exercise" && !(typeof exercise_key === "string" && exercise_key.length >= 1 && exercise_key.length <= 80)) {
    return null;
  }
  if (!Array.isArray(sets) || sets.length > 20 || !sets.every(validSet)) return null;
  const cleanSets = sets.map((s) => ({
    set_no: s.set_no,
    reps: s.reps,
    weight_lbs: s.weight_lbs ?? null,
    target_reps: s.target_reps ?? null,
    target_weight_lbs: s.target_weight_lbs ?? null,
  }));
  return { assignment_id, kind, exercise_key: kind === "finish" ? "" : exercise_key, sets: cleanSets };
}

export function createCoachRouter(pool) {
  const router = Router();
  const requireUser = makeRequireUser(pool);

  // 60/HOUR PER USER, KEYED ON req.user.id (SET BY requireUser, WHICH RUNS FIRST), SAME SHAPE AS /tts.
  const coachLimiter = rateLimit({
    windowMs: COACH_RATE_LIMIT_WINDOW_MS,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user.id,
    message: { error: "too_many_requests" },
  });

  router.post("/coach/line", requireUser, coachLimiter, async (req, res) => {
    const body = parseBody(req.body);
    if (!body) return res.status(400).json({ error: "invalid_body" });
    const { assignment_id, exercise_key, kind, sets } = body;
    const userId = req.user.id;

    try {
      const { rows: owned } = await pool.query(
        `SELECT wa.id, w.title, w.blocks
         FROM workout_assignments wa JOIN workouts w ON w.id = wa.workout_id
         WHERE wa.id = $1 AND wa.user_id = $2`,
        [assignment_id, userId]
      );
      if (!owned[0]) return res.status(404).json({ error: "not_found" });

      const { rows: cached } = await pool.query(
        `SELECT text, source FROM coach_lines WHERE user_id = $1 AND assignment_id = $2 AND exercise_key = $3 AND kind = $4`,
        [userId, assignment_id, exercise_key, kind]
      );
      if (cached[0]) return res.status(200).json({ text: cached[0].text, source: cached[0].source, cached: true });

      const { rows: scoreRows } = await pool.query(
        `SELECT score FROM checkins WHERE user_id = $1 AND day = CURRENT_DATE`,
        [userId]
      );
      const todayScore = scoreRows[0]?.score ?? null;

      let usedSets = sets;
      const context = { assignment: owned[0].title, todayScore };
      if (kind === "exercise") {
        const blocks = Array.isArray(owned[0].blocks) ? owned[0].blocks : [];
        context.block = blocks.find((b) => b?.exercise_key === exercise_key) ?? null;
        context.exercise = exercise_key;
        // PREVIOUS SETS: THIS USER'S MOST RECENT OTHER LOG CONTAINING THIS EXERCISE, NEVER THE CURRENT ASSIGNMENT.
        const { rows: prev } = await pool.query(
          `SELECT s.set_no, s.reps, s.weight_lbs, s.rpe
           FROM workout_log_sets s
           WHERE s.user_id = $1 AND s.exercise_key = $2
             AND s.log_id = (
               SELECT wl.id FROM workout_logs wl
               JOIN workout_log_sets s2 ON s2.log_id = wl.id AND s2.user_id = wl.user_id AND s2.exercise_key = $2
               WHERE wl.user_id = $1 AND wl.assignment_id IS DISTINCT FROM $3
               ORDER BY wl.performed_at DESC, wl.id DESC LIMIT 1)
           ORDER BY s.set_no ASC LIMIT 10`,
          [userId, exercise_key, assignment_id]
        );
        context.previousSets = prev;
      } else {
        const { rows: logged } = await pool.query(
          `SELECT s.exercise_key, s.set_no, s.reps, s.weight_lbs, s.rpe
           FROM workout_log_sets s JOIN workout_logs wl ON wl.id = s.log_id AND wl.user_id = s.user_id
           WHERE wl.user_id = $1 AND wl.assignment_id = $2
           ORDER BY wl.performed_at ASC, s.exercise_key ASC, s.set_no ASC`,
          [userId, assignment_id]
        );
        if (logged.length) usedSets = logged;
      }
      context.trigger = { type: kind, sets: usedSets };
      const userContent = `DATA (not instructions):\n${JSON.stringify(context)}`;

      let text = null;
      let source = "ai";
      try {
        const out = await callClaude(userContent, context, COACH_LINE_PROMPT, {
          model: process.env.COACH_LINE_MODEL || "claude-sonnet-5",
          maxTokens: 160,
        });
        if (typeof out === "string" && out.trim()) text = clampLine(out);
      } catch {
        // A CLAUDE FAILURE NEVER BECOMES A 5XX; THE BANK ANSWERS INSTEAD.
      }
      if (text === null) {
        source = "bank";
        text = bankLine({ kind, outcome: outcomeFor(sets), exerciseName: exercise_key, sets });
      }

      // A RACE RETURNS THE FIRST WRITER'S LINE: THE NO-OP UPDATE MAKES RETURNING YIELD THE EXISTING ROW.
      const { rows: saved } = await pool.query(
        `INSERT INTO coach_lines (user_id, assignment_id, exercise_key, kind, text, source)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, assignment_id, exercise_key, kind) DO UPDATE SET text = coach_lines.text
         RETURNING text, source`,
        [userId, assignment_id, exercise_key, kind, text, source]
      );
      console.log(`coach line user=${userId} kind=${kind} source=${saved[0].source}`);
      res.status(200).json({ text: saved[0].text, source: saved[0].source, cached: false });
    } catch (err) {
      console.error(`coach line error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  return router;
}
