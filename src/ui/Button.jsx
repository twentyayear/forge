import React from "react";
import { T } from "../theme.js";

const base = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: T.space[2],
  minHeight: 48, padding: `${T.space[3]}px ${T.space[4]}px`, borderRadius: T.radius.control,
  fontFamily: T.font.display, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em",
  fontSize: 16, lineHeight: 1, cursor: "pointer", border: "1px solid transparent",
};

const VARIANTS = {
  primary: { background: T.color.energy, color: T.color.inkOnEnergy },
  quiet: { background: T.color.surface2, color: T.color.text, fontSize: 14, minHeight: 44, fontWeight: 700 },
  ghost: { background: "transparent", color: T.color.body, borderColor: T.color.lineStrong, fontSize: 14, minHeight: 44, fontWeight: 700 },
};

export function Button({ variant = "primary", full = false, busy = false, disabled, type = "button", style, children, ...rest }) {
  return (
    <button type={type} className="wh-btn" disabled={disabled || busy} aria-busy={busy || undefined}
      style={{ ...base, ...VARIANTS[variant], width: full ? "100%" : undefined, ...style }} {...rest}>
      {children}
    </button>
  );
}
