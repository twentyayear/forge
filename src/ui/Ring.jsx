import React from "react";
import { T } from "../theme.js";

// score NULL DRAWS AN EMPTY TRACK AND A DASH: NO NUMBER IS SHOWN THAT THE SERVER DID NOT SEND.
export function Ring({ score, label = "Readiness", size = 126, tone = "energy" }) {
  const r = 52, circ = 2 * Math.PI * r;
  const has = Number.isFinite(score);
  const pct = has ? Math.max(0, Math.min(100, score)) : 0;
  const stroke = tone === "recovery" ? T.color.recovery : T.color.energy;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox="0 0 128 128" role="img" aria-label={has ? `${label} ${score} of 100` : `${label}: no score yet`}>
        <circle cx="64" cy="64" r={r} fill="none" stroke={T.color.surface2} strokeWidth="9" />
        {has && (
          <circle className="wh-ring-arc" cx="64" cy="64" r={r} fill="none" stroke={stroke} strokeWidth="9" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)} transform="rotate(-90 64 64)" />
        )}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: T.font.display, fontSize: Math.round(size * 0.32), fontWeight: 800, color: has ? T.color.text : T.color.muted, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {has ? score : "–"}
        </div>
        <div style={{ fontFamily: T.font.display, fontSize: 11, fontWeight: 600, color: T.color.muted, textTransform: "uppercase", letterSpacing: ".1em", marginTop: 2 }}>
          {label}
        </div>
      </div>
    </div>
  );
}
