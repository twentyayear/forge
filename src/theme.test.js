import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GOOGLE_FONTS_HREF } from "./theme.js";

const SRC = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SRC, "..");

function walk(dir, exts) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}
const rel = (p) => relative(ROOT, p);
const read = (p) => readFileSync(p, "utf8");

// THE NEEDLES ARE BUILT FROM PIECES SO THIS FILE NEVER MATCHES ITS OWN SCANS (OR THE GREEN-LIGHT GREPS).
const FETCH = "fetch" + "(";
const SPEECH = "speech" + "Synthesis";
const BANNED = ["SERVER" + "_MODE", "VITE_SERVER" + "_MODE", "READINESS" + "_TODAY", "build" + "Schedule("];
const SCHEDULE_WORD = new RegExp("\\b" + "SCHED" + "ULE" + "\\b");
const HEX = /#[0-9a-fA-F]{3,8}\b/;

const srcFiles = walk(SRC, [".js", ".jsx"]);

test("no hex colour literal outside src/theme.js", () => {
  const offenders = srcFiles
    .filter((p) => p !== join(SRC, "theme.js"))
    .filter((p) => HEX.test(read(p)));
  assert.deepEqual(offenders.map(rel), []);
});

test("no fetch outside src/lib/api.js", () => {
  const offenders = srcFiles
    .filter((p) => p !== join(SRC, "lib", "api.js"))
    .filter((p) => read(p).includes(FETCH));
  assert.deepEqual(offenders.map(rel), []);
});

test("no browser speech synthesis anywhere in src, public or server", () => {
  const files = [
    ...walk(SRC, [".js", ".jsx"]),
    ...walk(join(ROOT, "public"), [".js", ".html", ".webmanifest"]),
    ...walk(join(ROOT, "server"), [".js", ".mjs", ".cjs"]),
  ];
  assert.deepEqual(files.filter((p) => read(p).includes(SPEECH)).map(rel), []);
});

test("prototype mode is gone from src and the deploy script", () => {
  const offenders = srcFiles.filter((p) => {
    const t = read(p);
    return BANNED.some((b) => t.includes(b)) || SCHEDULE_WORD.test(t);
  });
  assert.deepEqual(offenders.map(rel), []);
  assert.equal(read(join(ROOT, "ops", "deploy.sh")).includes(BANNED[1]), false);
});

test("index.html carries the PWA links and the one fonts URL", () => {
  const html = read(join(ROOT, "index.html"));
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png"/);
  assert.match(html, /<meta name="theme-color" content="[^"]+"/);
  const hrefs = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(hrefs.includes(GOOGLE_FONTS_HREF), "index.html fonts link differs from GOOGLE_FONTS_HREF");
  assert.equal(html.includes("Space " + "Grotesk") || html.includes("Space+" + "Grotesk"), false);
});

test("manifest parses and every icon exists on disk", () => {
  const m = JSON.parse(read(join(ROOT, "public", "manifest.webmanifest")));
  assert.equal(m.name, "WORKHART");
  assert.equal(m.display, "standalone");
  assert.equal(m.icons.length, 3);
  for (const icon of m.icons) assert.ok(existsSync(join(ROOT, "public", icon.src)), `missing ${icon.src}`);
  assert.ok(m.icons.some((i) => i.purpose === "maskable"));
  assert.ok(existsSync(join(ROOT, "public", "icons", "apple-touch-icon.png")));
});

test("service worker never caches /api/", () => {
  const sw = read(join(ROOT, "public", "sw.js"));
  assert.ok(sw.includes('url.pathname.startsWith("/api/")'), "the /api/ pass-through guard is missing");
  const guard = sw.indexOf('url.pathname.startsWith("/api/")');
  const firstRespond = sw.indexOf("event.respondWith(");
  assert.ok(guard > -1 && guard < firstRespond, "the /api/ guard must run before any respondWith");
});
