import { apiBlob } from "./api.js";

// THE CLIENT ONLY NAMES THE VOICE; MODEL, STABILITY, SPEED AND THE PAUSES LIVE ON THE SERVER AND ARE SAM'S.
export const KYLE_VOICE = "ZAIovxRU9FXNYmauX8CL";

export const SPOKEN_WORDS = [
  [/\bDB\b/g, "dumbbell"],
  [/\bEZ-?Bar\b/gi, "easy bar"],
  [/\bRDL\b/g, "Romanian deadlift"],
  [/\bAMRAP\b/gi, "as many reps as possible"],
  [/\bBW\b/g, "bodyweight"],
  [/\b1RM\b/g, "one rep max"],
  [/\bHRV\b/g, "heart rate variability"],
];
export const speechify = (t) => SPOKEN_WORDS.reduce((s, [re, w]) => s.replace(re, w), t);

// ONE AUDIO ELEMENT AT A TIME; A NEW LINE CUTS THE OLD ONE. ON ANY FAILURE THE TEXT STAYS AND THERE IS NO FALLBACK VOICE.
export function createSpeaker({ onLine, onTalking, onStatus } = {}) {
  let voiceOn = true;
  let audio = null;
  const cache = {};
  const talking = (v) => { if (onTalking) onTalking(v); };
  const status = (v) => { if (onStatus) onStatus(v); };

  function stop() {
    if (audio) { try { audio.pause(); } catch { /* already gone */ } audio = null; }
    talking(false);
  }

  async function speak(text) {
    if (onLine) onLine(text);
    if (!voiceOn) return;
    stop();
    const spoken = speechify(text);
    try {
      const cacheKey = KYLE_VOICE + "|" + spoken;
      let url = cache[cacheKey];
      if (!url) {
        const res = await apiBlob("/api/tts", {
          method: "POST",
          body: JSON.stringify({ text: spoken, voice_id: KYLE_VOICE }),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        url = URL.createObjectURL(res.blob);
        cache[cacheKey] = url;
      }
      const a = new Audio(url);
      audio = a;
      a.onplay = () => talking(true);
      a.onended = () => talking(false);
      a.onerror = () => talking(false);
      await a.play();
      status("ok");
    } catch {
      status("fail");
      talking(false);
    }
  }

  return { speak, stop, setVoiceOn(v) { voiceOn = !!v; } };
}
