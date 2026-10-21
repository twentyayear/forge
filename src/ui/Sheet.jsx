import React, { useEffect } from "react";
import { X } from "lucide-react";
import { T } from "../theme.js";

export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} onClick={onClose}
      style={{ position: "fixed", inset: 0, background: T.color.scrim, zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div className="wh-rise" onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 430, background: T.color.surface, borderRadius: `${T.radius.card + 4}px ${T.radius.card + 4}px 0 0`,
          border: `1px solid ${T.color.line}`, borderBottom: "none", padding: `${T.space[4]}px ${T.space[5]}px calc(${T.space[6]}px + env(safe-area-inset-bottom))`,
          maxHeight: "82vh", overflowY: "auto", color: T.color.text, fontFamily: T.font.body }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: T.space[3] }}>
          <span style={{ fontFamily: T.font.display, fontSize: 22, fontWeight: 800, color: T.color.text, textTransform: "uppercase", letterSpacing: ".02em", lineHeight: 1 }}>{title}</span>
          <button type="button" className="wh-ck" onClick={onClose} aria-label="Close"
            style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", color: T.color.muted, flexShrink: 0, cursor: "pointer", borderRadius: T.radius.control }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
