import React from "react";
import { ChevronLeft } from "lucide-react";
import { T } from "../theme.js";
import { Button } from "../ui/index.js";
import { muted } from "../client/styles.js";

// A REAL BUTTON WITH role="switch"; THE WHOLE ROW IS THE 56 PX TARGET.
export function Switch({ on, onChange, label, hint, busy }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="wh-btn" disabled={busy} onClick={() => onChange(!on)}
      style={{ display: "flex", alignItems: "center", gap: T.space[3], width: "100%", minHeight: 56, padding: `${T.space[2]}px ${T.space[3]}px`, textAlign: "left", cursor: "pointer", font: "inherit",
        background: T.color.surface, border: `1px solid ${T.color.line}`, borderRadius: T.radius.card, color: T.color.text }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 600 }}>{label}</span>
        {hint && <span style={{ ...muted, display: "block" }}>{hint}</span>}
      </span>
      <Knob on={on} />
    </button>
  );
}

// THE TRACK AND THUMB SHARED BY EVERY SWITCH.
export function Knob({ on }) {
  return (
    <span aria-hidden="true" style={{ width: 48, height: 28, borderRadius: 14, flexShrink: 0, position: "relative", background: on ? T.color.energy : T.color.surface2, border: `1px solid ${on ? T.color.energy : T.color.lineStrong}` }}>
      <span style={{ position: "absolute", top: 2, left: on ? 22 : 2, width: 22, height: 22, borderRadius: "50%", background: on ? T.color.inkOnEnergy : T.color.muted, transition: "left .15s ease-out" }} />
    </span>
  );
}

// A CHIP-LOOKING TOGGLE WITH A FULL 44 PX HIT AREA, USED FOR CLIENT, INTENT, CHANNEL AND EQUIPMENT PICKS.
export function ToggleChip({ on, onClick, disabled, children, ...rest }) {
  return (
    <button type="button" className="wh-btn" aria-pressed={on} disabled={disabled} onClick={onClick}
      style={{ minHeight: 44, padding: `0 ${T.space[3]}px`, borderRadius: T.radius.chip, cursor: "pointer", font: "inherit",
        fontFamily: T.font.display, fontWeight: 700, fontSize: 14, letterSpacing: ".08em", textTransform: "uppercase", whiteSpace: "nowrap",
        background: on ? T.color.energy : T.color.surface2, color: on ? T.color.inkOnEnergy : T.color.body, border: `1px solid ${on ? T.color.energy : T.color.line}` }} {...rest}>
      {children}{on ? " ✓" : ""}
    </button>
  );
}

// MULTI-SELECT CLIENT CHIPS; EVERY id COMES FROM THE ROSTER THE SERVER RETURNED.
export function ClientPick({ clients, selected, onToggle, label }) {
  if (!clients) return <p role="status" style={muted}>Loading clients</p>;
  if (clients.length === 0) return <p style={muted}>No clients yet. Add one from the Roster.</p>;
  return (
    <div role="group" aria-label={label} style={{ display: "flex", flexWrap: "wrap", gap: T.space[2] }}>
      {clients.map((c) => (
        <ToggleChip key={c.id} on={selected.includes(c.id)} onClick={() => onToggle(c.id)}>{c.name}</ToggleChip>
      ))}
    </div>
  );
}

// THE TWO-WAY OR THREE-WAY SWITCH BETWEEN SECTIONS OF ONE TAB.
export function Seg({ items, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} style={{ display: "flex", gap: T.space[2] }}>
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button key={it.id} type="button" className="wh-btn" aria-pressed={on} onClick={() => onChange(it.id)}
            style={{ flex: 1, minHeight: 44, borderRadius: T.radius.control, cursor: "pointer", fontFamily: T.font.display, fontWeight: 700, fontSize: 14, letterSpacing: ".08em", textTransform: "uppercase",
              background: on ? T.color.energy : T.color.surface2, color: on ? T.color.inkOnEnergy : T.color.muted, border: `1px solid ${on ? T.color.energy : T.color.line}` }}>
            {it.label}{it.badge > 0 ? ` · ${it.badge}` : ""}
          </button>
        );
      })}
    </div>
  );
}

export function BackLink({ label, onBack }) {
  return (
    <button type="button" className="wh-btn" onClick={onBack}
      style={{ display: "inline-flex", alignItems: "center", gap: T.space[1], minHeight: 44, padding: 0, background: "none", border: "none", color: T.color.muted, cursor: "pointer", font: "inherit", justifySelf: "start" }}>
      <ChevronLeft size={18} /> {label}
    </button>
  );
}

export function ErrorText({ children }) {
  if (!children) return null;
  return <p role="alert" style={{ margin: 0, color: T.color.warn, fontSize: T.type.small }}>{children}</p>;
}

// LOADING, FAILED-WITH-RETRY OR NOTHING; THE CALLER RENDERS THE DATA ITSELF.
export function LoadState({ res, what }) {
  if (res.data) return null;
  if (res.loading) return <p role="status" style={muted}>Loading</p>;
  if (res.error) {
    return (
      <div role="alert" style={{ display: "grid", gap: T.space[3], justifyItems: "start" }}>
        <p style={{ margin: 0, color: T.color.warn }}>Couldn't load {what}. Check your connection and try again.</p>
        <Button variant="quiet" onClick={res.reload}>Try again</Button>
      </div>
    );
  }
  return null;
}

export const rowCard = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: T.space[3], minHeight: 56 };
