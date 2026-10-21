import React from "react";
import { T } from "../theme.js";

export function TabBar({ items, active, onSelect, label = "Main" }) {
  return (
    <nav aria-label={label}
      style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, zIndex: 40,
        background: T.color.bg, borderTop: `1px solid ${T.color.line}`,
        display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`, padding: `${T.space[1]}px ${T.space[1]}px calc(${T.space[2]}px + env(safe-area-inset-bottom))` }}>
      {items.map(({ id, label: text, icon: Icon, badge }) => {
        const on = id === active;
        return (
          <button key={id} type="button" className="wh-tab" onClick={() => onSelect(id)} aria-current={on ? "page" : undefined}
            style={{ background: "none", border: "none", minHeight: 52, padding: `${T.space[2]}px ${T.space[1]}px`, cursor: "pointer", borderRadius: T.radius.control,
              display: "flex", flexDirection: "column", alignItems: "center", gap: T.space[1], color: on ? T.color.energy : T.color.muted }}>
            <span style={{ position: "relative", display: "block" }}>
              {Icon && <Icon size={20} strokeWidth={on ? 2.4 : 2} />}
              {badge > 0 && (
                <span aria-label={`${badge} new`}
                  style={{ position: "absolute", top: -4, right: -10, minWidth: 16, height: 16, borderRadius: 8, padding: "0 4px",
                    background: T.color.energy, color: T.color.inkOnEnergy, fontFamily: T.font.display, fontWeight: 800, fontSize: 11, lineHeight: "16px", textAlign: "center" }}>
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </span>
            <span style={{ fontFamily: T.font.display, fontWeight: 600, fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase" }}>{text}</span>
          </button>
        );
      })}
    </nav>
  );
}
