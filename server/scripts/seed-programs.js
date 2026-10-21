// server/scripts/seed-programs.js — seed the six starter programs (server/data/programs.js) for the trainer.
// Run on the droplet: node --env-file=/etc/workhart/env scripts/seed-programs.js [trainer email]
// IDEMPOTENT: A WORKOUT OR PROGRAM WITH THE SAME TITLE FOR THE SAME TRAINER IS REUSED, NEVER DUPLICATED.
import pg from "pg";
import { PROGRAMS, WORKOUTS, programDays } from "../data/programs.js";

const { Pool } = pg;

// seedPrograms(pool, trainerId) -> {workoutsCreated, programsCreated, daysCreated}. SAFE TO RUN TWICE.
export async function seedPrograms(pool, trainerId) {
  const summary = { workoutsCreated: 0, programsCreated: 0, daysCreated: 0 };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const workoutIds = {};
    for (const [title, w] of Object.entries(WORKOUTS)) {
      const existing = await client.query(`SELECT id FROM workouts WHERE created_by = $1 AND title = $2 ORDER BY created_at ASC LIMIT 1`, [trainerId, title]);
      if (existing.rows[0]) {
        workoutIds[title] = existing.rows[0].id;
        continue;
      }
      // pg SERIALISES A BARE ARRAY AS A POSTGRES ARRAY LITERAL, NOT JSON: STRINGIFY (SAME RULE AS admin.js).
      const { rows } = await client.query(
        `INSERT INTO workouts (created_by, title, notes, blocks) VALUES ($1, $2, $3, $4) RETURNING id`,
        [trainerId, title, w.notes, JSON.stringify(w.blocks)]
      );
      workoutIds[title] = rows[0].id;
      summary.workoutsCreated++;
    }
    for (const program of PROGRAMS) {
      const existing = await client.query(`SELECT id FROM programs WHERE trainer_id = $1 AND title = $2 LIMIT 1`, [trainerId, program.title]);
      if (existing.rows[0]) continue;
      const { rows } = await client.query(
        `INSERT INTO programs (trainer_id, title, description) VALUES ($1, $2, $3) RETURNING id`,
        [trainerId, program.title, program.description]
      );
      for (const d of programDays(program)) {
        await client.query(`INSERT INTO program_days (program_id, day_index, workout_id) VALUES ($1, $2, $3)`, [rows[0].id, d.day_index, workoutIds[d.workoutTitle]]);
        summary.daysCreated++;
      }
      summary.programsCreated++;
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return summary;
}

// RUNS ONLY AS A SCRIPT, SO THE TEST CAN IMPORT seedPrograms WITHOUT A DATABASE_URL.
const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  if (!process.env.DATABASE_URL) {
    console.error("FATAL: DATABASE_URL is not set");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const email = process.argv[2];
  const trainer = email
    ? await pool.query(`SELECT id FROM users WHERE email = $1 AND role = 'admin'`, [email])
    : await pool.query(`SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1`);
  if (!trainer.rows[0]) {
    console.error("FATAL: no trainer found");
    await pool.end();
    process.exit(1);
  }
  const summary = await seedPrograms(pool, trainer.rows[0].id);
  console.log(`seed-programs: workouts +${summary.workoutsCreated}, programs +${summary.programsCreated}, days +${summary.daysCreated}`);
  await pool.end();
}
