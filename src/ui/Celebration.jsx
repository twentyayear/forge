import React from "react";
import { T } from "../theme.js";

// THE MEDAL ALONE: 88 PX WITH THE REVEAL SPRING ON THE CELEBRATION CARD, ANY OTHER SIZE STATIC FOR LIST ROWS.
export function Medal({ n, size = 88 }) {
  const big = size >= 88;
  return (
    <div className={big ? "wh-medal" : undefined} aria-hidden="true"
      style={{ width: size, height: size, borderRadius: "50%", margin: big ? "6px auto 0" : 0, display: "grid", placeItems: "center", flexShrink: 0,
        background: `radial-gradient(circle at 35% 30%, ${T.color.medalHi}, ${T.color.medalMid} 60%, ${T.color.medalLo})`,
        boxShadow: `0 0 0 ${big ? 6 : 3}px ${T.color.medalHalo}`, fontFamily: T.font.display, fontWeight: 800, fontSize: Math.round(size * 0.34), color: T.color.onDeep }}>
      {n}
    </div>
  );
}

export function Celebration({ title, blurb, n, label = "New achievement" }) {
  return (
    <div style={{ background: T.color.surface, border: `1px solid ${T.color.line}`, borderRadius: T.radius.card,
      padding: `${T.space[5]}px ${T.space[4]}px`, textAlign: "center" }}>
      <Medal n={n} />
      <p style={{ margin: `${T.space[3]}px 0 0`, fontFamily: T.font.display, fontWeight: 700, fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: T.color.energy }}>{label}</p>
      <p role="status" style={{ margin: `${T.space[1]}px 0 0`, fontFamily: T.font.display, fontWeight: 700, fontSize: 22, lineHeight: 1.05, color: T.color.text }}>{title}</p>
      {blurb && <p style={{ margin: `${T.space[1]}px 0 0`, color: T.color.muted, fontSize: T.type.small }}>{blurb}</p>}
    </div>
  );
}
