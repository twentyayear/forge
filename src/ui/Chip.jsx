import React from "react";
import { T } from "../theme.js";

const TONES = {
  default: { background: T.color.surface2, color: T.color.body },
  energy: { background: T.color.energy, color: T.color.inkOnEnergy },
  warn: { background: T.color.warnBg, color: T.color.warn },
  good: { background: T.color.goodBg, color: T.color.good },
};

const chipStyle = {
  display: "inline-flex", alignItems: "center", gap: T.space[1], whiteSpace: "nowrap",
  fontFamily: T.font.display, fontWeight: 600, fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase",
  padding: "4px 8px", borderRadius: T.radius.chip, lineHeight: 1.2, border: "none",
};

// A CHIP WITH onClick BECOMES A BUTTON, PADDED TO A 44 PX HIT AREA WITHOUT LOOKING BIGGER.
export function Chip({ tone = "default", onClick, style, children, ...rest }) {
  const look = { ...chipStyle, ...TONES[tone], ...style };
  if (!onClick) return <span style={look} {...rest}>{children}</span>;
  return (
    <button type="button" className="wh-chip-btn" onClick={onClick}
      style={{ background: "none", border: "none", padding: "10px 0", margin: "-10px 0", cursor: "pointer", minHeight: 44 }} {...rest}>
      <span style={look}>{children}</span>
    </button>
  );
}
