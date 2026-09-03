// server/routes.js — reference scoped routes: the pattern every later
// endpoint (U3+) copies.
//
// GET /api/checkins is the canonical scoped read: filtered strictly by
// req.user.id (never by any id from the request). GET /api/admin/users is
// the one exception the invariant allows — a user id may appear in the
// response (not as scoping input) because requireAdmin gates the whole route.
import { Router } from "express";
import { makeRequireUser, requireAdmin } from "./authz.js";

export function createScopedRouter(pool) {
  const router = Router();
  const requireUser = makeRequireUser(pool);

  router.get("/checkins", requireUser, async (req, res) => {
    const { from, to } = req.query;
    const conditions = ["user_id = $1"];
    const params = [req.user.id];

    if (typeof from === "string" && from) {
      params.push(from);
      conditions.push(`day >= $${params.length}`);
    }
    if (typeof to === "string" && to) {
      params.push(to);
      conditions.push(`day <= $${params.length}`);
    }

    try {
      const { rows } = await pool.query(
        `SELECT id, day, score, answers, created_at, updated_at
         FROM checkins
         WHERE ${conditions.join(" AND ")}
         ORDER BY day ASC`,
        params
      );
      res.status(200).json(rows);
    } catch (err) {
      console.error(`checkins query error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  router.get("/admin/users", requireUser, requireAdmin, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT u.id, u.email, u.name, u.role, u.created_at,
                MAX(c.day) AS last_checkin_day
         FROM users u
         LEFT JOIN checkins c ON c.user_id = u.id
         GROUP BY u.id
         ORDER BY u.created_at ASC`
      );
      res.status(200).json(rows);
    } catch (err) {
      console.error(`admin users query error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  return router;
}
