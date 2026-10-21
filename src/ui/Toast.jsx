import React, { useEffect } from "react";
import { T } from "../theme.js";

const EDGE = { default: T.color.line, good: T.color.good, warn: T.color.warn };

// bottomOffset LIFTS THE TOAST OVER A PINNED COMPOSER; THE DEFAULT SITS JUST ABOVE THE TAB BAR.
export function Toast({ message, tone = "default", duration = 4000, onDone, bottomOffset = T.space[8] * 3 }) {
  useEffect(() => {
    if (!message || !onDone || !duration) return undefined;
    const t = setTimeout(onDone, duration);
    return () => clearTimeout(t);
  }, [message, duration, onDone]);
  if (!message) return null;
  // POSITIONED WITH left/right AND AUTO MARGINS, NEVER transform: THE wh-rise ANIMATION ENDS ON transform: none AND WOULD SHIFT THE TOAST HALF A WIDTH RIGHT.
  return (
    <div role="status" aria-live="polite" className="wh-rise"
      style={{ position: "fixed", left: T.space[4], right: T.space[4], margin: "0 auto", bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom))`,
        zIndex: 60, width: "auto", maxWidth: 398, background: T.color.surface2,
        border: `1px solid ${EDGE[tone] || EDGE.default}`, borderRadius: T.radius.control, padding: `${T.space[3]}px ${T.space[4]}px`,
        color: T.color.text, fontFamily: T.font.body, fontSize: T.type.small + 1, lineHeight: 1.4 }}>
      {message}
    </div>
  );
}
