# Ask 09 — Restore ElevenLabs coach voices (no robot fallback, key stays server-side)

## Context
Repo: `/Users/sm-pro/Projects/forge`. The browser-TTS voice was deleted (ask 08) — `speak(text)`
is currently text-only (`setLine`). We are restoring the ElevenLabs integration recovered from the
site's previous deploy. `ELEVENLABS_API_KEY` already exists in the Netlify site env — never put a
key in code. HARD RULE: `window.speechSynthesis` must NEVER be reintroduced, including as a
fallback — on any TTS failure the coach stays text-only.

Files you may touch: `src/Forge.jsx`, `netlify.toml`, `vite.config.js`, and NEW file
`netlify/functions/tts.mjs`. No servers started/stopped, nothing else installed.

## 1. New file `netlify/functions/tts.mjs` — copy EXACTLY:
```js
const ALLOWED_VOICES = new Set([
  "TxGEqnHWrfWFTfGW9XjX", "pNInz6obpgDQGcFmaJgB", "JBFqnCBsd6RMkjVDRZzb",
  "21m00Tcm4TlvDq8ikWAM", "AZnzlk1XvdvUeBnXmlld", "XrExE9yKIg1WjnnlVkGX",
]);
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
  const r = await fetch(`${EL_ORIGIN}/v1/text-to-speech/${voice}`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: "eleven_turbo_v2_5",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!r.ok) return new Response("Upstream error", { status: 502 });
  return new Response(r.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
};

export const config = { path: "/api/tts" };
```

## 2. `netlify.toml` — add (keep existing content; the function `config.path` handles routing, but
the SPA catch-all must not shadow it):
```toml
[functions]
  directory = "netlify/functions"
```
Insert a redirect ABOVE the existing `/*` SPA redirect:
```toml
[[redirects]]
  from = "/api/tts"
  to = "/.netlify/functions/tts"
  status = 200
```

## 3. `vite.config.js` — add a dev proxy inside `server`:
`proxy: { "/api": { target: "https://forgeitinfire.netlify.app", changeOrigin: true } }`
(so local dev voice hits the deployed function).

## 4. `src/Forge.jsx`
Module level:
```js
const TTS_ENDPOINT = "/api/tts";
const EL_VOICES = [
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh",    tag: "Energetic hype coach", g: "M" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam",    tag: "Deep & steady", g: "M" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George",  tag: "Calm & composed", g: "M" },
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel",  tag: "Warm & clear", g: "F" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi",    tag: "Bold & driven", g: "F" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", tag: "Friendly & upbeat", g: "F" },
];
```
State/refs in `Forge()`:
```js
const [voiceOn, setVoiceOn] = useState(true);
const [talking, setTalking] = useState(false);
const [voicePick, setVoicePick] = useState(() => {
  const v = localStorage.getItem("forge.voice");
  return EL_VOICES.some((x) => x.id === v) ? v : EL_VOICES[0].id;
});
const [voiceStatus, setVoiceStatus] = useState(null);
const audioRef = useRef(null);
const ttsCache = useRef({});
```
Helpers (place where `speak` is now; `speak` REPLACES the current text-only version):
```js
const stopAudio = () => {
  if (audioRef.current) { try { audioRef.current.pause(); } catch (e) {} audioRef.current = null; }
  setTalking(false);
};
const speak = async (text, overrideVoice) => {
  setLine(text);
  if (!voiceOn) return;
  stopAudio();
  const vid = overrideVoice || voicePick;
  try {
    const cacheKey = vid + "|" + text;
    let url = ttsCache.current[cacheKey];
    if (!url) {
      const res = await fetch(TTS_ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice_id: vid }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      url = URL.createObjectURL(await res.blob());
      ttsCache.current[cacheKey] = url;
    }
    const a = new Audio(url);
    audioRef.current = a;
    a.onplay = () => setTalking(true);
    a.onended = () => setTalking(false);
    a.onerror = () => setTalking(false);
    await a.play();
    setVoiceStatus("ok");
  } catch (e) { setVoiceStatus("fail"); setTalking(false); }
};
const pickVoice = (id) => {
  setVoicePick(id); setVoiceStatus(null);
  localStorage.setItem("forge.voice", id);
  const v = EL_VOICES.find((x) => x.id === id);
  speak(`Hey Alex — I'm ${v.name}. Let's get after it.`, id);
};
useEffect(() => () => stopAudio(), []);
```
Restore UI that ask 08 removed:
- Header right side: the Voice toggle button back exactly as it was (Volume2/VolumeX icons —
  re-add the imports), `onClick={() => { setVoiceOn(!voiceOn); if (voiceOn) stopAudio(); }}`.
- Active-workout orb: `className={talking ? "orb-live" : ""}`, opacity `talking ? 1 : .4`, and the
  `{talking && <div className="eq" aria-hidden="true"><span/><span/><span/><span/></div>}` block.
- `css` string: restore the `orbPulse` keyframes, `.orb-live` rule, `eq` keyframes, `.eq span`
  rules, and `.orb-live,.eq span` in the reduced-motion list (they were exactly as in git history —
  `git show 2711522:src/Forge.jsx` has the originals).
- "End workout" onClick: add `stopAudio();` before the existing logic.

New Coach-tab section — insert between the coach header Card and `<Label>Recent updates</Label>`:
`<Label>Your coach's voice</Label>` + Card with a 2-column grid (`display:grid,
gridTemplateColumns:"1fr 1fr", gap:9`) of the 6 voices; each cell `role="radio"`,
`aria-checked={sel}`, `tabIndex 0`, Enter/Space handling, `onClick={() => pickVoice(v.id)}`;
selected style `background:"rgba(247,183,51,.08)", border:"1px solid rgba(247,183,51,.55)"`, else
`C.surface2`/`C.line`; borderRadius 14, padding "12px 12px 10px", minHeight 64; name 14px/700
(`C.energy` when selected, else `C.text`), a tiny top-right chip with `v.g` (9px, muted, 1px line
border, borderRadius 6, padding "2px 5px"), and `v.tag` 10.5px muted below. Under the grid, when
`voiceStatus === "fail"`: muted 11px line `Voice unavailable right now — coach will text instead.`

## Green-light
```bash
npm run build                                    # exit 0
node --check netlify/functions/tts.mjs           # exit 0
grep -c "speechSynthesis" src/Forge.jsx          # 0  (robot voice stays dead)
grep -c "EL_VOICES" src/Forge.jsx                # ≥ 4
grep -rc "ELEVENLABS_API_KEY" src/ | grep -v ':0' | wc -l   # 0 (key never in client code)
grep -c "api/tts" netlify.toml                   # ≥ 1
```
