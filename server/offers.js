// SERVER/OFFERS.JS: TRAINER OFFERS (A 1:1, A CALL, A PROGRAM) AND CLIENT REQUESTS FOR THEM (W.5).
import { Router } from "express";
import { makeRequireUser, requireAdmin } from "./authz.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ["session", "call", "program", "other"];
const MAX_PRICE_CENTS = 2147483647;
const OFFER_COLS = "id, title, blurb, price_cents, kind, active, created_at, updated_at";

function isDbInputError(err) {
  return typeof err?.code === "string" && (err.code.startsWith("22") || err.code.startsWith("23"));
}

const validTitle = (v) => typeof v === "string" && v.trim().length >= 1 && v.trim().length <= 120;
const validBlurb = (v) => v === null || (typeof v === "string" && v.length <= 500);
const validPrice = (v) => Number.isInteger(v) && v >= 0 && v <= MAX_PRICE_CENTS;
const validKind = (v) => KINDS.includes(v);

export function createOffersRouter(pool) {
  const router = Router();
  const requireUser = makeRequireUser(pool);

  const notFound = (res) => res.status(404).json({ error: "not_found" });
  const invalid = (res) => res.status(400).json({ error: "invalid_body" });
  const fail = (res, label, err) => {
    console.error(`${label}: ${err.message}`);
    res.status(500).json({ error: "internal_error" });
  };

  // TRAINER ROUTES ARE SCOPED BY trainer_id = req.user.id.

  router.get("/admin/offers", requireUser, requireAdmin, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT o.id, o.title, o.blurb, o.price_cents, o.kind, o.active, o.created_at, o.updated_at,
                (SELECT COUNT(*)::int FROM offer_requests r WHERE r.offer_id = o.id AND r.status = 'open') AS request_count
         FROM offers o WHERE o.trainer_id = $1 ORDER BY o.created_at DESC`,
        [req.user.id]
      );
      res.status(200).json(rows);
    } catch (err) {
      fail(res, "offers list error", err);
    }
  });

  router.post("/admin/offers", requireUser, requireAdmin, async (req, res) => {
    const { title, blurb = null, price_cents, kind } = req.body ?? {};
    if (!validTitle(title) || !validBlurb(blurb) || !validPrice(price_cents) || !validKind(kind)) return invalid(res);
    try {
      const { rows } = await pool.query(
        `INSERT INTO offers (trainer_id, title, blurb, price_cents, kind) VALUES ($1, $2, $3, $4, $5)
         RETURNING ${OFFER_COLS}`,
        [req.user.id, title.trim(), blurb, price_cents, kind]
      );
      res.status(201).json({ ...rows[0], request_count: 0 });
    } catch (err) {
      if (isDbInputError(err)) return invalid(res);
      fail(res, "offer insert error", err);
    }
  });

  router.patch("/admin/offers/:id", requireUser, requireAdmin, async (req, res) => {
    const b = req.body ?? {};
    const sets = [];
    const vals = [];
    const add = (col, v) => {
      vals.push(v);
      sets.push(`${col} = $${vals.length}`);
    };
    if (b.title !== undefined) {
      if (!validTitle(b.title)) return invalid(res);
      add("title", b.title.trim());
    }
    if (b.blurb !== undefined) {
      if (!validBlurb(b.blurb)) return invalid(res);
      add("blurb", b.blurb);
    }
    if (b.price_cents !== undefined) {
      if (!validPrice(b.price_cents)) return invalid(res);
      add("price_cents", b.price_cents);
    }
    if (b.kind !== undefined) {
      if (!validKind(b.kind)) return invalid(res);
      add("kind", b.kind);
    }
    if (b.active !== undefined) {
      if (typeof b.active !== "boolean") return invalid(res);
      add("active", b.active);
    }
    if (sets.length === 0) return invalid(res);
    if (!UUID_RE.test(req.params.id)) return notFound(res);

    try {
      vals.push(req.params.id, req.user.id);
      const { rows } = await pool.query(
        `UPDATE offers SET ${sets.join(", ")}, updated_at = now()
         WHERE id = $${vals.length - 1} AND trainer_id = $${vals.length} RETURNING ${OFFER_COLS}`,
        vals
      );
      if (rows.length === 0) return notFound(res);
      res.status(200).json(rows[0]);
    } catch (err) {
      if (isDbInputError(err)) return invalid(res);
      fail(res, "offer patch error", err);
    }
  });

  router.delete("/admin/offers/:id", requireUser, requireAdmin, async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return notFound(res);
    try {
      const own = await pool.query(`SELECT 1 FROM offers WHERE id = $1 AND trainer_id = $2`, [req.params.id, req.user.id]);
      if (own.rows.length === 0) return notFound(res);
      const reqs = await pool.query(`SELECT 1 FROM offer_requests WHERE offer_id = $1 LIMIT 1`, [req.params.id]);
      if (reqs.rows.length > 0) return res.status(409).json({ error: "has_requests" });
      await pool.query(`DELETE FROM offers WHERE id = $1 AND trainer_id = $2`, [req.params.id, req.user.id]);
      res.status(204).end();
    } catch (err) {
      // A REQUEST ARRIVING BETWEEN THE CHECK AND THE DELETE TRIPS THE FOREIGN KEY.
      if (err?.code === "23503") return res.status(409).json({ error: "has_requests" });
      fail(res, "offer delete error", err);
    }
  });

  router.get("/admin/offer-requests", requireUser, requireAdmin, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT r.id, r.offer_id, o.title AS offer_title, r.user_id, u.name AS user_name, r.created_at
         FROM offer_requests r
         JOIN offers o ON o.id = r.offer_id
         JOIN users u ON u.id = r.user_id
         WHERE o.trainer_id = $1 AND r.status = 'open'
         ORDER BY r.created_at DESC`,
        [req.user.id]
      );
      res.status(200).json(rows);
    } catch (err) {
      fail(res, "offer requests list error", err);
    }
  });

  router.patch("/admin/offer-requests/:id", requireUser, requireAdmin, async (req, res) => {
    if (req.body?.status !== "closed") return invalid(res);
    if (!UUID_RE.test(req.params.id)) return notFound(res);
    try {
      const { rows } = await pool.query(
        `UPDATE offer_requests r SET status = 'closed'
         FROM offers o
         WHERE r.id = $1 AND o.id = r.offer_id AND o.trainer_id = $2
         RETURNING r.id, r.offer_id, r.user_id, r.status, r.created_at`,
        [req.params.id, req.user.id]
      );
      if (rows.length === 0) return notFound(res);
      res.status(200).json(rows[0]);
    } catch (err) {
      fail(res, "offer request patch error", err);
    }
  });

  // CLIENT ROUTES ONLY EVER SEE THE CALLER'S OWN TRAINER'S ACTIVE OFFERS.

  router.get("/offers", requireUser, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT o.id, o.title, o.blurb, o.price_cents, o.kind
         FROM offers o JOIN users u ON u.trainer_id = o.trainer_id
         WHERE u.id = $1 AND o.active ORDER BY o.created_at DESC`,
        [req.user.id]
      );
      res.status(200).json(rows);
    } catch (err) {
      fail(res, "offers read error", err);
    }
  });

  router.post("/offers/:id/request", requireUser, async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return notFound(res);
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const { rows: offers } = await db.query(
        `SELECT o.id, o.title FROM offers o JOIN users u ON u.trainer_id = o.trainer_id
         WHERE o.id = $1 AND u.id = $2 AND o.active`,
        [req.params.id, req.user.id]
      );
      if (offers.length === 0) {
        await db.query("ROLLBACK");
        return notFound(res);
      }
      const open = await db.query(
        `SELECT 1 FROM offer_requests WHERE offer_id = $1 AND user_id = $2 AND status = 'open'`,
        [req.params.id, req.user.id]
      );
      if (open.rows.length > 0) {
        await db.query("ROLLBACK");
        return res.status(409).json({ error: "already_open" });
      }
      const { rows: reqRows } = await db.query(
        `INSERT INTO offer_requests (offer_id, user_id) VALUES ($1, $2) RETURNING id`,
        [req.params.id, req.user.id]
      );
      const { rows: msgRows } = await db.query(
        `INSERT INTO messages (user_id, sender, body) VALUES ($1, 'user', $2) RETURNING id`,
        [req.user.id, `I'd like to book: ${offers[0].title}`]
      );
      await db.query("COMMIT");
      res.status(201).json({ request_id: reqRows[0].id, message_id: msgRows[0].id });
    } catch (err) {
      await db.query("ROLLBACK").catch(() => {});
      fail(res, "offer request error", err);
    } finally {
      db.release();
    }
  });

  return router;
}
