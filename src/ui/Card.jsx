import React from "react";
import { T } from "../theme.js";

export function Card({ accent = false, style, children, ...rest }) {
  return (
    <div style={{
      background: T.color.surface, border: `1px solid ${accent ? T.color.energy : T.color.line}`,
      borderRadius: T.radius.card, padding: T.space[3], ...style,
    }} {...rest}>
      {children}
    </div>
  );
}
