// server/routes.js — reference scoped routes: the pattern every later
// endpoint (U3+) copies.
//
// GET /api/checkins is the canonical scoped read: filtered strictly by
// req.user.id (never by any id from the request). Admin routes (a user id
// may appear as input, gated by requireAdmin) now live in server/admin.js --
// GET /api/admin/users moved there in U5a (ask 30).
import { Router } from "express";
import { makeRequireUser } from "./authz.js";

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

  return router;
}
