// server/app.js — Express app factory, split from index.js's listen() so the
// app is importable and bootable in-process (ephemeral port) without a real
// network listener. This is how the test suite exercises real HTTP behavior
// against TEST_DATABASE_URL: it builds its own pool and calls createApp(pool)
// directly, never touching index.js or DATABASE_URL.
import express from "express";
import { createAuthRouter } from "./auth.js";
import { createScopedRouter } from "./routes.js";
import { createDataRouter } from "./data.js";

export function createApp(pool) {
  const app = express();

  // Single reverse proxy (nginx) in front on the droplet; needed so
  // express-rate-limit and req.ip see the real client address.
  app.set("trust proxy", 1);

  // Default 100kb json limit everywhere except /api/import, which parses its
  // own body with a 2mb limit (see data.js) -- a full prototype localStorage
  // dump can exceed 100kb. Skipping it here keeps the raised limit scoped to
  // that one route instead of the whole app.
  app.use((req, res, next) => {
    if (req.path === "/api/import") return next();
    express.json()(req, res, next);
  });

  app.get("/api/health", async (_req, res) => {
    let db = false;
    try {
      await pool.query("SELECT 1");
      db = true;
    } catch {
      db = false;
    }
    res.status(200).json({ ok: true, service: "workhart-api", db });
  });

  app.use("/api/auth", createAuthRouter(pool));
  app.use("/api", createScopedRouter(pool));
  app.use("/api", createDataRouter(pool));

  return app;
}
