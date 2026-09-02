const ALLOWED_VOICES = new Set(["ZAIovxRU9FXNYmauX8CL"]);
const EL_ORIGIN = "https://api.elevenlabs.io";

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return new Response("TTS not configured", { status: 503 });
  let body;
  try { body = await req.json(); } catch { return new Response("Bad request", { status: 400 }); }
  const text = String(body.text || "").slice(0, 300).trim();
  const voice = String(body.voice_id || "");
  if (!text) return new Response("Missing text", { status: 400 });
  if (!ALLOWED_VOICES.has(voice)) return new Response("Unknown voice", { status: 400 });
  // real pause at each sentence boundary — models rush periods on their own
  const spoken = text.replace(/([.!?])\s+/g, '$1 <break time="0.6s" /> ');
  const r = await fetch(`${EL_ORIGIN}/v1/text-to-speech/${voice}`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: spoken,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true, speed: 0.85 },
    }),
  });
  if (!r.ok) return new Response("Upstream error", { status: 502 });
  return new Response(r.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
};

export const config = { path: "/api/tts" };
