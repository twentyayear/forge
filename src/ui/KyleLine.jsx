import React from "react";
import { RotateCcw } from "lucide-react";
import { T } from "../theme.js";

export function Avatar({ initial = "K", size = 34 }) {
  return (
    <div aria-hidden="true" style={{ width: size, height: size, borderRadius: "50%", background: T.color.energy, flex: "none",
      display: "grid", placeItems: "center", fontFamily: T.font.display, fontWeight: 800, fontSize: Math.round(size * 0.45), color: T.color.inkOnEnergy }}>
      {initial}
    </div>
  );
}

// BARS ANIMATE ONLY WHILE AUDIO PLAYS AND ONLY WITHOUT prefers-reduced-motion (THE KEYFRAMES LIVE IN styles.jsx).
export function Waveform({ on, bars = 12, height = 22 }) {
  return (
    <div className={`wh-wave${on ? " on" : ""}`} aria-hidden="true" style={{ height, display: "flex", alignItems: "center", gap: 2 }}>
      {Array.from({ length: bars }, (_, i) => <i key={i} />)}
    </div>
  );
}

export function KyleLine({ text, talking = false, meta, initial = "K", onReplay, size = "sm" }) {
  const big = size === "lg";
  if (big) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: T.space[3] }}>
        <Avatar initial={initial} size={72} />
        <Waveform on={talking} bars={16} height={36} />
        <p aria-live="polite" style={{ margin: 0, fontFamily: T.font.display, fontWeight: 700, fontSize: 24, lineHeight: 1.1, color: T.color.text, textWrap: "balance" }}>{text}</p>
        {onReplay && <ReplayButton onReplay={onReplay} />}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: T.space[3], alignItems: "flex-start" }}>
      <Avatar initial={initial} />
      <div style={{ minWidth: 0, flex: 1 }}>
        {meta && <p style={{ margin: 0, color: T.color.muted, fontSize: T.type.label }}>{meta}</p>}
        <p aria-live="polite" style={{ margin: 0, color: T.color.text, fontSize: T.type.body, lineHeight: 1.4 }}>{text}</p>
        {talking && <div style={{ marginTop: T.space[2] }}><Waveform on /></div>}
        {onReplay && <div style={{ marginTop: T.space[2] }}><ReplayButton onReplay={onReplay} /></div>}
      </div>
    </div>
  );
}

function ReplayButton({ onReplay }) {
  return (
    <button type="button" className="wh-btn" onClick={onReplay}
      style={{ display: "inline-flex", alignItems: "center", gap: T.space[2], minHeight: 44, padding: `0 ${T.space[4]}px`,
        background: T.color.surface2, color: T.color.text, border: "none", borderRadius: T.radius.control, cursor: "pointer",
        fontFamily: T.font.display, fontWeight: 700, fontSize: 14, letterSpacing: ".08em", textTransform: "uppercase" }}>
      <RotateCcw size={16} /> Say it again
    </button>
  );
}
