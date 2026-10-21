import { useCallback, useEffect, useRef, useState } from "react";
import { createSpeaker } from "../lib/speech.js";

// ONE SPEAKER PER SHELL; THE REACT STATE ONLY MIRRORS WHAT THE SPEAKER REPORTS. voiceOn COMES FROM THE PROFILE.
export function useSpeaker(voiceOn) {
  const [talking, setTalking] = useState(false);
  const [status, setStatus] = useState(null);
  const [line, setLine] = useState("");
  const ref = useRef(null);
  if (!ref.current) ref.current = createSpeaker({ onLine: setLine, onTalking: setTalking, onStatus: setStatus });

  useEffect(() => { ref.current.setVoiceOn(voiceOn); }, [voiceOn]);
  useEffect(() => () => ref.current.stop(), []);

  const speak = useCallback((text) => ref.current.speak(text), []);
  const stop = useCallback(() => ref.current.stop(), []);
  return { speak, stop, talking, status, line };
}
