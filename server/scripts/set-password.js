// server/scripts/set-password.js — droplet-only: set a user's password.
//
// Usage: node --env-file=/etc/workhart/env scripts/set-password.js <email>
//
// Reads the password from a no-echo TTY prompt (or the first stdin line when
// stdin is not a TTY). Never prints the password or the hash.
import pg from "pg";
import { hashPassword, validatePassword } from "../password.js";

if (!process.env.DATABASE_URL) {
  console.error("FATAL: DATABASE_URL is not set");
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error("usage: node scripts/set-password.js <email>");
  process.exit(1);
}

function promptHidden(label) {
  return new Promise((resolve) => {
    process.stdout.write(label);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let buf = "";
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          process.stdout.write("\n");
          return resolve(buf);
        }
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          process.stdout.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") buf = buf.slice(0, -1);
        else buf += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function readFirstLine() {
  let data = "";
  for await (const chunk of process.stdin) {
    data += chunk;
    if (data.includes("\n")) break;
  }
  return data.split(/\r?\n/)[0];
}

let password;
if (process.stdin.isTTY) {
  password = await promptHidden("New password: ");
  const again = await promptHidden("Repeat password: ");
  if (password !== again) {
    console.error("passwords do not match");
    process.exit(1);
  }
} else {
  password = await readFirstLine();
}

if (!validatePassword(password)) {
  console.error("password must be 10–200 characters");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const hash = await hashPassword(password);
  const { rows } = await pool.query(`UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id`, [
    hash,
    email.trim(),
  ]);
  if (!rows[0]) {
    console.error("no such user");
    process.exitCode = 1;
  } else {
    console.log(`password set for ${email.trim()}`);
  }
} finally {
  await pool.end();
}
