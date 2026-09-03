import express from "express";
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("FATAL: DATABASE_URL is not set");
  process.exit(1);
}

const port = process.env.PORT;
if (!port) {
  console.error("FATAL: PORT is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const app = express();

app.get("/api/health", async (_req, res) => {
  let db = false;
  try {
    await pool.query("SELECT 1");
    db = true;
  } catch (err) {
    db = false;
  }
  res.status(200).json({ ok: true, service: "workhart-api", db });
});

app.listen(port, () => {
  console.log(`workhart-api listening on ${port}`);
});
