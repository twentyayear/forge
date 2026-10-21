import React from "react";
import { T } from "../theme.js";

export function Bar({ value = 0, label = "Progress", style }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}
      style={{ height: 8, borderRadius: 4, background: T.color.surface2, overflow: "hidden", ...style }}>
      <div style={{ height: "100%", width: "100%", background: T.color.energy, transform: `scaleX(${pct / 100})`, transformOrigin: "left", transition: "transform .3s ease-out" }} />
    </div>
  );
}
