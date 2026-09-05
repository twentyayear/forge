// server/messages.js — Kyle <-> athlete messaging (U6, ask 32).
// One implicit thread per athlete, keyed by users.user_id (see the `messages`
// table, ask 25 -- no schema changes this unit). Athlete routes are scoped
// strictly to req.user.id (never a request-supplied id); admin routes accept
// a :id URL param (validated to exist first) same as admin.js's convention.
import { Router } from "express";
import { makeRequireUser, requireAdmin } from "./authz.js";

const MAX_BODY_LEN = 2000;

// Postgres data-exception (22xxx) / integrity-constraint-violation (23xxx)
// codes -- same convention as data.js/admin.js: a malformed uuid or other
// caller-supplied garbage reads as 404/400, never 500.
function isDbInputError(err) {
  return typeof err?.code === "string" && (err.code.startsWith("22") || err.code.startsWith("23"));
}

function validBody(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_BODY_LEN) return null;
  return trimmed;
}

export function createMessagesRouter(pool) {
  const router = Router();
  const requireUser = makeRequireUser(pool);

  // ---- Athlete (scoped to req.user.id) ----

  router.get("/messages", requireUser, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, sender, body, ai_generated, created_at
         FROM messages WHERE user_id = $1 ORDER BY created_at ASC`,
        [req.user.id]
      );
      res.status(200).json(rows);
    } catch (err) {
      console.error(`messages query error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  router.post("/messages", requireUser, async (req, res) => {
    const body = validBody(req.body?.body);
    if (body === null) return res.status(400).json({ error: "invalid message" });

    try {
      const { rows } = await pool.query(
        `INSERT INTO messages (user_id, sender, body)
         VALUES ($1, 'user', $2)
         RETURNING id, sender, body, ai_generated, created_at`,
        [req.user.id, body]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (isDbInputError(err)) return res.status(400).json({ error: "invalid message" });
      console.error(`message insert error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  router.post("/messages/read", requireUser, async (req, res) => {
    try {
      const { rowCount } = await pool.query(
        `UPDATE messages SET read_at = now() WHERE user_id = $1 AND sender = 'kyle' AND read_at IS NULL`,
        [req.user.id]
      );
      res.status(200).json({ marked: rowCount });
    } catch (err) {
      console.error(`message read-mark error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  // ---- Admin (Kyle console) ----

  // GET /admin/inbox -- one row per athlete who has any messages OR any
  // assignments, most-recently-active first. Two lateral joins (last message,
  // unread count) instead of N+1 per-athlete queries.
  router.get("/admin/inbox", requireUser, requireAdmin, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT u.id, u.email, u.name,
                lm.sender AS last_sender, lm.body AS last_body, lm.created_at AS last_created_at,
                COALESCE(uc.cnt, 0)::int AS unread
         FROM users u
         LEFT JOIN LATERAL (
           SELECT sender, body, created_at FROM messages m
           WHERE m.user_id = u.id ORDER BY m.created_at DESC LIMIT 1
         ) lm ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS cnt FROM messages m
           WHERE m.user_id = u.id AND m.sender = 'user' AND m.read_at IS NULL
         ) uc ON true
         WHERE u.role != 'admin'
           AND (
             EXISTS (SELECT 1 FROM messages m2 WHERE m2.user_id = u.id)
             OR EXISTS (SELECT 1 FROM workout_assignments wa WHERE wa.user_id = u.id)
           )
         ORDER BY lm.created_at DESC NULLS LAST`
      );
      const inbox = rows.map((r) => ({
        user: { id: r.id, name: r.name, email: r.email },
        last_message: r.last_sender
          ? { sender: r.last_sender, body: r.last_body, created_at: r.last_created_at }
          : null,
        unread: r.unread,
      }));
      res.status(200).json(inbox);
    } catch (err) {
      console.error(`inbox query error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  // GET /admin/users/:id/messages -- that user's thread asc, marking their
  // user-sent unread rows read in the same request (Kyle just viewed them).
  router.get("/admin/users/:id/messages", requireUser, requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
      const userResult = await pool.query(`SELECT 1 FROM users WHERE id = $1`, [id]);
      if (userResult.rows.length === 0) return res.status(404).json({ error: "not_found" });

      const { rowCount: marked } = await pool.query(
        `UPDATE messages SET read_at = now() WHERE user_id = $1 AND sender = 'user' AND read_at IS NULL`,
        [id]
      );
      const { rows } = await pool.query(
        `SELECT id, sender, body, ai_generated, created_at
         FROM messages WHERE user_id = $1 ORDER BY created_at ASC`,
        [id]
      );
      res.status(200).json({ marked, messages: rows });
    } catch (err) {
      if (isDbInputError(err)) return res.status(404).json({ error: "not_found" });
      console.error(`admin thread query error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  // POST /admin/users/:id/messages {body} -- Kyle's reply.
  router.post("/admin/users/:id/messages", requireUser, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const body = validBody(req.body?.body);
    if (body === null) return res.status(400).json({ error: "invalid message" });

    try {
      const userResult = await pool.query(`SELECT 1 FROM users WHERE id = $1`, [id]);
      if (userResult.rows.length === 0) return res.status(404).json({ error: "not_found" });

      const { rows } = await pool.query(
        `INSERT INTO messages (user_id, sender, body)
         VALUES ($1, 'kyle', $2)
         RETURNING id, sender, body, ai_generated, created_at`,
        [id, body]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (isDbInputError(err)) return res.status(404).json({ error: "not_found" });
      console.error(`admin message insert error: ${err.message}`);
      res.status(500).json({ error: "internal_error" });
    }
  });

  return router;
}
