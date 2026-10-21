import React, { useEffect } from "react";
import { T } from "../theme.js";

const EDGE = { default: T.color.line, good: T.color.good, warn: T.color.warn };

export function Toast({ message, tone = "default", duration = 4000, onDone }) {
  useEffect(() => {
    if (!message || !onDone || !duration) return undefined;
    const t = setTimeout(onDone, duration);
    return () => clearTimeout(t);
  }, [message, duration, onDone]);
  if (!message) return null;
  return (
    <div role="status" aria-live="polite" className="wh-rise"
      style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: `calc(${T.space[8] * 3}px + env(safe-area-inset-bottom))`,
        zIndex: 60, width: `calc(100% - ${T.space[4] * 2}px)`, maxWidth: 398, background: T.color.surface2,
        border: `1px solid ${EDGE[tone] || EDGE.default}`, borderRadius: T.radius.control, padding: `${T.space[3]}px ${T.space[4]}px`,
        color: T.color.text, fontFamily: T.font.body, fontSize: T.type.small + 1, lineHeight: 1.4 }}>
      {message}
    </div>
  );
}
