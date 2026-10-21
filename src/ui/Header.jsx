import React from "react";
import { T } from "../theme.js";

export function Header({ kicker, title, right }) {
  return (
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: T.space[3] }}>
      <div style={{ minWidth: 0 }}>
        {kicker && (
          <p style={{ margin: 0, fontFamily: T.font.display, fontWeight: 700, fontSize: T.type.label, letterSpacing: ".1em", textTransform: "uppercase", color: T.color.muted }}>{kicker}</p>
        )}
        <h1 style={{ margin: 0, fontFamily: T.font.display, fontWeight: 800, fontSize: T.type.display, lineHeight: 0.95, letterSpacing: ".02em", textTransform: "uppercase", color: T.color.text, textWrap: "balance" }}>{title}</h1>
      </div>
      {right}
    </header>
  );
}
