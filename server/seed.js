// server/seed.js — idempotent seed: Sam (user) + Kyle (admin).
// Run with: npm run seed
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("FATAL: DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SEED_USERS = [
  { email: "hey@blueroutevineyard.com", name: "Sam", role: "user" },
  { email: "hey+kyle@blueroutevineyard.com", name: "Kyle", role: "admin" },
];

async function main() {
  let inserted = 0;
  for (const u of SEED_USERS) {
    const result = await pool.query(
      `INSERT INTO users (email, name, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING`,
      [u.email, u.name, u.role]
    );
    inserted += result.rowCount;
  }
  console.log(`seed: ${inserted} row(s) inserted (of ${SEED_USERS.length} seed users)`);
  await pool.end();
}

main().catch((err) => {
  console.error("seed failed:", err.message);
  process.exit(1);
});
