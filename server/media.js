// server/media.js — /api/tts + /api/food, ported verbatim from the Netlify
// reference functions (netlify/functions/tts.mjs, food.mjs) so alphaecho.io
// is self-contained. Netlify's functions are untouched; this is a straight
// port of behavior, not a redesign.
//
// Kyle voice recipe is Sam-tuned — copied byte-for-byte, do not alter:
// single-voice allowlist ZAIovxRU9FXNYmauX8CL, model eleven_multilingual_v2,
// voice_settings {stability:0.5, similarity_boost:0.75, style:0.2,
// use_speaker_boost:true, speed:0.85}, sentence-break transform.
import { Router } from "express";
import { Readable } from "node:stream";
import { rateLimit } from "express-rate-limit";
import { makeRequireUser } from "./authz.js";
import { addSentenceBreaks, mapOffHit } from "./media-lib.js";

const ALLOWED_VOICES = new Set(["ZAIovxRU9FXNYmauX8CL"]);
const EL_ORIGIN = "https://api.elevenlabs.io";
const OFF_ORIGIN = "https://search.openfoodfacts.org";
const TTS_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export function createMediaRouter(pool) {
  const router = Router();
  const requireUser = makeRequireUser(pool);

  // 60/hour per user — the droplet spends real ElevenLabs credits per call,
  // unlike the prototype's open Netlify function. Keyed on req.user.id
  // (set by requireUser, which runs first), so a plain keyGenerator is safe
  // here — no need for express-rate-limit's ipKeyGenerator helper.
  const ttsLimiter = rateLimit({
    windowMs: TTS_RATE_LIMIT_WINDOW_MS,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user.id,
    message: { error: "too_many_requests" },
  });

  router.post("/tts", requireUser, ttsLimiter, async (req, res) => {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return res.status(503).type("text/plain").send("TTS not configured");

    const body = req.body ?? {};
    const text = String(body.text || "").slice(0, 300).trim();
    const voice = String(body.voice_id || "");
    if (!text) return res.status(400).type("text/plain").send("Missing text");
    if (!ALLOWED_VOICES.has(voice)) return res.status(400).type("text/plain").send("Unknown voice");

    const spoken = addSentenceBreaks(text);

    let upstream;
    try {
      upstream = await fetch(`${EL_ORIGIN}/v1/text-to-speech/${voice}`, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: spoken,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.2,
            use_speaker_boost: true,
            speed: 0.85,
          },
        }),
      });
    } catch (err) {
      // Never leak upstream error details (or the key) to the client or logs.
      console.error(`tts upstream fetch failed`);
      return res.status(502).type("text/plain").send("Upstream error");
    }

    if (!upstream.ok || !upstream.body) {
      return res.status(502).type("text/plain").send("Upstream error");
    }

    res.status(200).set({ "Content-Type": "audio/mpeg", "Cache-Control": "no-store" });
    const stream = Readable.fromWeb(upstream.body);
    stream.on("error", () => {
      console.error(`tts stream error`);
      res.end();
    });
    stream.pipe(res);
  });

  router.get("/food", requireUser, async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length < 2 || q.length > 40) return res.status(400).type("text/plain").send("Bad request");

    const apiUrl = `${OFF_ORIGIN}/search?q=${encodeURIComponent(q)}&page_size=8&fields=product_name,brands,serving_size,nutriments`;

    let upstream;
    try {
      upstream = await fetch(apiUrl, {
        headers: { "User-Agent": "Workhart-Alphaecho/1.0 (personal use)" },
      });
    } catch (err) {
      console.error(`food upstream fetch failed`);
      return res.status(502).type("text/plain").send("Upstream error");
    }
    if (!upstream.ok) return res.status(502).type("text/plain").send("Upstream error");

    let json;
    try {
      json = await upstream.json();
    } catch (err) {
      console.error(`food upstream parse failed`);
      return res.status(502).type("text/plain").send("Upstream error");
    }

    const hits = Array.isArray(json.hits) ? json.hits : [];
    const results = hits.map(mapOffHit).filter(Boolean);

    res.status(200).set("Cache-Control", "public, max-age=300").json({ results });
  });

  return router;
}
