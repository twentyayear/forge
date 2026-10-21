// server/seed.js — idempotent seed: Sam (user) + Kyle (admin).
// Run with: npm run seed
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("FATAL: DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// KYLE IS INSERTED FIRST BECAUSE EVERY CLIENT ROW MUST CARRY ITS TRAINER'S ID (USERS_TRAINER_BY_ROLE CHECK).
const SEED_USERS = [
  { email: "kyle@alphaecho.io", name: "Kyle", role: "admin" },
  { email: "hey@blueroutevineyard.com", name: "Sam", role: "user" },
];

async function main() {
  let inserted = 0;
  for (const u of SEED_USERS) {
    const trainerId =
      u.role === "user"
        ? (await pool.query(`SELECT id FROM users WHERE email = $1`, [SEED_USERS[0].email])).rows[0].id
        : null;
    const result = await pool.query(
      `INSERT INTO users (email, name, role, trainer_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      [u.email, u.name, u.role, trainerId]
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
