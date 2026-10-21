import React from "react";
import { T } from "../theme.js";

export function Numeral({ value, unit, size = T.type.numeral, color = T.color.text, style }) {
  return (
    <div style={{
      fontFamily: T.font.display, fontWeight: 800, fontSize: size, lineHeight: 0.9, letterSpacing: "-.01em",
      fontVariantNumeric: "tabular-nums", color, ...style,
    }}>
      {value}
      {unit && (
        <small style={{ fontSize: Math.round(size * 0.32), fontWeight: 600, color: T.color.muted, letterSpacing: ".06em", marginLeft: 4 }}>
          {unit}
        </small>
      )}
    </div>
  );
}
