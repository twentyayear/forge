// server/auth.js — passwordless magic-link auth routes, mounted at /api/auth.
//
// Raw tokens exist ONLY in the email link URL momentarily — never logged,
// never stored (only sha256 hashes land in Postgres).
import crypto from "node:crypto";
import { Router } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { sendMagicLink } from "./mail.js";
import { hashToken, parseCookies, SESSION_COOKIE, makeRequireUser } from "./authz.js";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function genRawToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function createAuthRouter(pool) {
  const router = Router();
  const requireUser = makeRequireUser(pool);

  // 20/hour per IP.
  const requestLinkIpLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "too_many_requests" },
  });

  // 5/hour per email (falls back to IP if the body has no email yet).
  const requestLinkEmailLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) =>
      typeof req.body?.email === "string" && req.body.email.trim()
        ? req.body.email.trim().toLowerCase()
        : ipKeyGenerator(req.ip),
    message: { error: "too_many_requests" },
  });

  // 30/hour per IP.
  const verifyLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "too_many_requests" },
  });

  // Always 200 {ok:true}, whether or not the account exists — no oracle.
  router.post("/request-link", requestLinkIpLimiter, requestLinkEmailLimiter, async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";

    if (email) {
      try {
        const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
        const user = rows[0];
        if (user) {
          const raw = genRawToken();
          const tokenHash = hashToken(raw);
          const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);
          await pool.query(
            `INSERT INTO magic_link_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
            [user.id, tokenHash, expiresAt]
          );
          const base = process.env.APP_BASE_URL || "";
          const url = `${base}/api/auth/verify?token=${raw}`;
          await sendMagicLink(email, url);
        }
      } catch (err) {
        console.error(`request-link error: ${err.message}`);
      }
    }

    res.status(200).json({ ok: true });
  });

  router.get("/verify", verifyLimiter, async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const reject = () => res.redirect(302, "/?auth=expired");

    if (!token) return reject();

    try {
      const tokenHash = hashToken(token);
      const { rows } = await pool.query(
        `SELECT id, user_id, expires_at, used_at FROM magic_link_tokens WHERE token_hash = $1`,
        [tokenHash]
      );
      const row = rows[0];
      if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) {
        return reject();
      }

      await pool.query(`UPDATE magic_link_tokens SET used_at = now() WHERE id = $1`, [row.id]);

      const sessionRaw = genRawToken();
      const sessionHash = hashToken(sessionRaw);
      const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS);
      await pool.query(`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`, [
        row.user_id,
        sessionHash,
        sessionExpiresAt,
      ]);

      res.cookie(SESSION_COOKIE, sessionRaw, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_TTL_MS,
      });

      res.redirect(302, "/");
    } catch (err) {
      console.error(`verify error: ${err.message}`);
      reject();
    }
  });

  router.post("/logout", async (req, res) => {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const raw = cookies[SESSION_COOKIE];
      if (raw) {
        await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [hashToken(raw)]);
      }
    } catch (err) {
      console.error(`logout error: ${err.message}`);
    }

    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.status(200).json({ ok: true });
  });

  router.get("/me", requireUser, (req, res) => {
    res.status(200).json(req.user);
  });

  return router;
}
