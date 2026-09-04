// server/scripts/mint-link.js — droplet-only helper to mint a magic-link URL
// while Resend is sandboxed. Same hashing (authz.js#hashToken, imported not
// duplicated) and same TTL math as server/auth.js's /request-link route.
//
// Usage (on the droplet only):
//   node --env-file=/etc/workhart/env scripts/mint-link.js <email>
//
// Prints ONLY the single-use, 15-minute sign-in URL. Never prints the token
// hash, any session token, or any env value — that's the whole point of
// hashing raw tokens before they ever touch Postgres.
import crypto from "node:crypto";
import pg from "pg";
import { hashToken } from "../authz.js";

const { Pool } = pg;

// Mirrors server/auth.js's MAGIC_LINK_TTL_MS. Not imported because auth.js
// doesn't export it and this ask's hard rule is "nothing under server/
// changes except this new script" — so the value is duplicated here
// deliberately, not accidentally. Keep it in sync with auth.js by hand.
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

if (!process.env.DATABASE_URL) {
  console.error("FATAL: DATABASE_URL is not set");
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error("usage: node scripts/mint-link.js <email>");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function genRawToken() {
  return crypto.randomBytes(32).toString("base64url");
}

async function main() {
  const { rows } = await pool.query(`SELECT id FROM users WHERE email = $1`, [email.trim()]);
  const user = rows[0];
  if (!user) {
    console.error(`no user found for ${email}`);
    await pool.end();
    process.exit(1);
  }

  const raw = genRawToken();
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);
  await pool.query(
    `INSERT INTO magic_link_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [user.id, tokenHash, expiresAt]
  );

  console.log(`https://alphaecho.io/api/auth/verify?token=${raw}`);
  await pool.end();
}

main().catch((err) => {
  console.error("mint-link failed:", err.message);
  process.exit(1);
});
