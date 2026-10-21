import React from "react";
import { Check, Plus, Minus } from "lucide-react";
import { T } from "../theme.js";

const head = { fontFamily: T.font.display, fontSize: 12, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: T.color.muted };
const cell = {
  width: "100%", minHeight: 44, background: T.color.surface2, border: "none", borderRadius: T.radius.chip,
  textAlign: "center", fontFamily: T.font.display, fontWeight: 700, fontSize: 20, color: T.color.text,
  fontVariantNumeric: "tabular-nums", outlineOffset: -2,
};

// A SET IS A HIT WHEN IT IS DONE AND MEETS BOTH TARGETS THE TRAINER SET; A MISSING TARGET COUNTS AS MET.
export function isHit(row) {
  if (!row.done) return false;
  const repsOk = row.target_reps == null || Number(row.reps) >= Number(row.target_reps);
  const weightOk = row.target_weight_lbs == null || Number(row.weight_lbs ?? 0) >= Number(row.target_weight_lbs);
  return repsOk && weightOk;
}

export function SetGrid({ rows, onChange, onToggle, onAdd, onRemove, bodyweight = false }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 1fr 44px", gap: T.space[2], alignItems: "center", fontVariantNumeric: "tabular-nums" }}>
        <div style={head}>Set</div><div style={{ ...head, textAlign: "center" }}>Reps</div>
        <div style={{ ...head, textAlign: "center" }}>lb</div><div />
        {rows.map((row, k) => {
          const hit = isHit(row);
          const n = row.set_no ?? k + 1;
          const hitRing = hit ? { outline: `2px solid ${T.color.energy}` } : null;
          return (
            <React.Fragment key={n}>
              <div style={{ fontFamily: T.font.display, fontWeight: 700, fontSize: 15, color: T.color.muted }}>{n}</div>
              <input className="wh-field" type="number" inputMode="numeric" aria-label={`Set ${n} reps`} value={row.reps ?? ""} disabled={row.done}
                onChange={(e) => onChange && onChange(k, { reps: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                style={{ ...cell, ...hitRing }} />
              {bodyweight ? (
                <div style={{ ...cell, display: "flex", alignItems: "center", justifyContent: "center", color: T.color.body, ...hitRing }}>BW</div>
              ) : (
                <input className="wh-field" type="number" inputMode="decimal" aria-label={`Set ${n} weight in pounds`} value={row.weight_lbs ?? ""} disabled={row.done}
                  onChange={(e) => onChange && onChange(k, { weight_lbs: e.target.value === "" ? null : Number(e.target.value) })}
                  style={{ ...cell, ...hitRing }} />
              )}
              <button type="button" className="wh-ck" aria-pressed={!!row.done} aria-label={row.done ? `Undo set ${n}` : `Log set ${n}`}
                onClick={() => onToggle && onToggle(k)}
                style={{ width: 44, height: 44, display: "grid", placeItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer", borderRadius: T.radius.control }}>
                <span style={{ width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center",
                  background: row.done ? T.color.energy : "transparent", border: `2px solid ${row.done ? T.color.energy : T.color.lineStrong}` }}>
                  {row.done && <Check size={18} strokeWidth={3} color={T.color.inkOnEnergy} />}
                </span>
              </button>
            </React.Fragment>
          );
        })}
      </div>
      {(onAdd || onRemove) && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: T.space[2], marginTop: T.space[3] }}>
          {onRemove && (
            <button type="button" className="wh-btn" onClick={onRemove} disabled={rows.length <= 1 || rows[rows.length - 1]?.done}
              style={stepStyle} aria-label="Remove last set"><Minus size={16} /> Set</button>
          )}
          {onAdd && (
            <button type="button" className="wh-btn" onClick={onAdd} style={stepStyle} aria-label="Add a set"><Plus size={16} /> Set</button>
          )}
        </div>
      )}
    </div>
  );
}

const stepStyle = {
  display: "inline-flex", alignItems: "center", gap: T.space[1], minHeight: 44, padding: `0 ${T.space[3]}px`,
  background: T.color.surface2, color: T.color.body, border: "none", borderRadius: T.radius.control, cursor: "pointer",
  fontFamily: T.font.display, fontWeight: 700, fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase",
};
