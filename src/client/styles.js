import { T } from "../theme.js";

// SHARED LOOK FOR THE COACH, FUEL AND YOU SCREENS: KICKER LABELS, FORM FIELDS, THE 44 PX ROW BUTTON.
export const kicker = { margin: 0, fontFamily: T.font.display, fontWeight: 700, fontSize: T.type.label, letterSpacing: ".1em", textTransform: "uppercase", color: T.color.muted };
export const bigline = { margin: `${T.space[1]}px 0 0`, fontFamily: T.font.display, fontWeight: 700, fontSize: 22, lineHeight: 1.05, color: T.color.text };
export const muted = { color: T.color.muted, fontSize: T.type.small, lineHeight: 1.4 };
// 16 PX TEXT IN THE FIELDS STOPS iOS SAFARI ZOOMING THE PAGE ON FOCUS.
export const field = {
  width: "100%", boxSizing: "border-box", minHeight: 48, padding: `0 ${T.space[4]}px`,
  background: T.color.surface2, border: `1px solid ${T.color.line}`, borderRadius: T.radius.control,
  color: T.color.text, fontFamily: T.font.body, fontSize: 16, outline: "none",
};
export const fieldLabel = { display: "block", ...kicker, marginBottom: T.space[2] };
// A TAPPABLE CARD: A REAL BUTTON WEARING THE CARD LOOK.
export const cardButton = {
  display: "block", width: "100%", textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit",
  background: T.color.surface, border: `1px solid ${T.color.line}`, borderRadius: T.radius.card, padding: T.space[3],
};
export const iconButton = {
  width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  background: "none", border: "none", color: T.color.muted, cursor: "pointer", borderRadius: T.radius.control,
};
export const sectionTitle = { ...kicker, marginTop: T.space[2] };
