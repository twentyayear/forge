import pg from "pg";
import { createApp } from "./app.js";

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

// Fail-fast at boot in production: RESEND_API_KEY must look like a Resend key.
// Never print the value, only whether the format is valid.
if (process.env.NODE_ENV === "production") {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey || !resendKey.startsWith("re_")) {
    console.error("FATAL: RESEND_API_KEY invalid format");
    process.exit(1);
  }
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = createApp(pool);

app.listen(port, () => {
  console.log(`workhart-api listening on ${port}`);
});
