// server/authz.js — session auth middleware.
//
// The invariant: the acting user id NEVER comes from request params/body —
// it derives from the session, attached here as req.user. Only /api/admin/*
// (gated by requireAdmin) may take a user id as input.
import crypto from "node:crypto";

export const SESSION_COOKIE = "wh_session";
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

export function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// Minimal Cookie-header parser. Avoids adding cookie-parser as a dependency —
// res.cookie()/res.clearCookie() (used for writes) are native to Express and
// don't need it; this is only for reading the incoming Cookie header.
export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    const rawValue = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(rawValue);
    } catch {
      out[key] = rawValue;
    }
  }
  return out;
}

// requireUser(pool) -> Express middleware. Attaches req.user = {id, email, name, role}.
export function makeRequireUser(pool) {
  return async function requireUser(req, res, next) {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const raw = cookies[SESSION_COOKIE];
      if (!raw) {
        return res.status(401).json({ error: "unauthorized" });
      }

      const tokenHash = hashToken(raw);
      const { rows } = await pool.query(
        `SELECT s.id AS session_id, s.expires_at, s.last_seen_at,
                u.id AS user_id, u.email, u.name, u.role
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1`,
        [tokenHash]
      );

      const row = rows[0];
      if (!row || new Date(row.expires_at).getTime() <= Date.now()) {
        return res.status(401).json({ error: "unauthorized" });
      }

      req.user = { id: row.user_id, email: row.email, name: row.name, role: row.role };
      req.sessionId = row.session_id;

      if (Date.now() - new Date(row.last_seen_at).getTime() > LAST_SEEN_THROTTLE_MS) {
        pool
          .query(`UPDATE sessions SET last_seen_at = now() WHERE id = $1`, [row.session_id])
          .catch((err) => console.error(`session last_seen_at update failed: ${err.message}`));
      }

      next();
    } catch (err) {
      console.error(`requireUser error: ${err.message}`);
      res.status(401).json({ error: "unauthorized" });
    }
  };
}

// requireAdmin — mount AFTER requireUser. Non-admin -> 404 (not 403: don't
// advertise that an admin surface exists).
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(404).end();
  }
  next();
}
