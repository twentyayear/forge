import React from "react";
import { T } from "../theme.js";

export function Celebration({ title, blurb, n, label = "New achievement" }) {
  return (
    <div style={{ background: T.color.surface, border: `1px solid ${T.color.line}`, borderRadius: T.radius.card,
      padding: `${T.space[5]}px ${T.space[4]}px`, textAlign: "center" }}>
      <div className="wh-medal" aria-hidden="true"
        style={{ width: 88, height: 88, borderRadius: "50%", margin: "6px auto 0", display: "grid", placeItems: "center",
          background: `radial-gradient(circle at 35% 30%, ${T.color.medalHi}, ${T.color.medalMid} 60%, ${T.color.medalLo})`,
          boxShadow: `0 0 0 6px ${T.color.medalHalo}`, fontFamily: T.font.display, fontWeight: 800, fontSize: 30, color: T.color.onDeep }}>
        {n}
      </div>
      <p style={{ margin: `${T.space[3]}px 0 0`, fontFamily: T.font.display, fontWeight: 700, fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: T.color.energy }}>{label}</p>
      <p role="status" style={{ margin: `${T.space[1]}px 0 0`, fontFamily: T.font.display, fontWeight: 700, fontSize: 22, lineHeight: 1.05, color: T.color.text }}>{title}</p>
      {blurb && <p style={{ margin: `${T.space[1]}px 0 0`, color: T.color.muted, fontSize: T.type.small }}>{blurb}</p>}
    </div>
  );
}
