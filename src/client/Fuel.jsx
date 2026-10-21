import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { T } from "../theme.js";
import { Bar, Button, Card, Header, Numeral, Ring, Sheet, Toast } from "../ui/index.js";
import { DEFAULT_FUEL_TARGETS, FUEL_QUICK } from "../data/fuel.js";
import { foodSearch } from "../lib/api.js";
import { call, post } from "./net.js";
import { dayTotals, fmtKcal, lastDays, normalizeFood, proteinRange } from "./fuel.js";
import { field, fieldLabel, iconButton, kicker, muted, sectionTitle } from "./styles.js";
import { todayStr } from "./engine.js";

const SPOKE_KEY = "workhart.proteinSpokeDay";

function Field({ id, label, ...rest }) {
  return (
    <div>
      <label htmlFor={id} style={fieldLabel}>{label}</label>
      <input id={id} className="wh-field" style={field} {...rest} />
    </div>
  );
}

export function Fuel({ data, speaker, reload, onSignedOut }) {
  const today = todayStr();
  const [day, setDay] = useState(today);
  const [toast, setToast] = useState("");
  const clearToast = useCallback(() => setToast(""), []);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null); // null = not searched; [] = nothing found
  const [searchDown, setSearchDown] = useState(false);
  const [custom, setCustom] = useState(null);
  const [targets, setTargets] = useState(null);

  const profile = data.profile || {};
  const tgt = {
    kcal: Number(profile.fuelTargets?.kcal) || DEFAULT_FUEL_TARGETS.kcal,
    protein: Number(profile.fuelTargets?.protein) || DEFAULT_FUEL_TARGETS.protein,
  };
  const rows = data.fuel || [];
  const days = useMemo(() => lastDays(today, 7), [today]);
  const totals = dayTotals(rows, day);
  const dayRows = rows.filter((r) => String(r.eaten_on).slice(0, 10) === day);
  const proteinPct = Math.min(100, Math.round((totals.protein / tgt.protein) * 100));

  // DEBOUNCED SEARCH: 350 MS AFTER THE LAST KEYSTROKE; A COUNTER DROPS ANSWERS THAT ARRIVE OUT OF ORDER.
  const seq = useRef(0);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); setSearchDown(false); return undefined; }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      let res;
      try { res = await foodSearch(term); } catch { res = { ok: false, data: null }; }
      if (mine !== seq.current) return;
      if (!res.ok) { setResults([]); setSearchDown(true); return; }
      const list = Array.isArray(res.data?.results) ? res.data.results : Array.isArray(res.data?.hits) ? res.data.hits : [];
      setResults(list.map(normalizeFood).filter(Boolean));
      setSearchDown(false);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const add = async (item, source, raw) => {
    if (busy) return;
    setBusy(true);
    const before = dayTotals(rows, day).protein;
    const res = await post("/api/fuel-logs", {
      eaten_on: day, name: item.name,
      calories: Math.round(item.kcal || 0), protein_g: Math.round(item.protein || 0),
      carbs_g: Math.round(item.carbs || 0), fat_g: Math.round(item.fat || 0),
      source, ...(raw ? { raw } : {}),
    }, onSignedOut);
    if (!res.ok) { setBusy(false); setToast("Couldn't save that food. Try again."); return false; }
    await reload();
    setBusy(false);
    // THE PROTEIN LINE IS SPOKEN ONCE PER DAY, ONLY WHEN TODAY'S TOTAL CROSSES THE TARGET ON THIS ADD.
    const after = before + Math.round(item.protein || 0);
    if (day === today && before < tgt.protein && after >= tgt.protein) {
      let spoke = null;
      try { spoke = localStorage.getItem(SPOKE_KEY); } catch { /* storage unavailable */ }
      if (spoke !== day) {
        try { localStorage.setItem(SPOKE_KEY, day); } catch { /* storage unavailable */ }
        speaker.speak(`Protein target hit — ${tgt.protein} grams down. That's how you build.`);
      }
    }
    return true;
  };

  const remove = async (row) => {
    if (busy) return;
    setBusy(true);
    const res = await call(`/api/fuel-logs/${row.id}`, { method: "DELETE" }, onSignedOut);
    if (!res.ok) setToast("Couldn't delete that entry. Try again.");
    else await reload();
    setBusy(false);
  };

  const saveCustom = async () => {
    const name = custom.name.trim();
    if (!name) return;
    const ok = await add({ name, kcal: Number(custom.kcal) || 0, protein: Number(custom.protein) || 0, carbs: Number(custom.carbs) || 0, fat: Number(custom.fat) || 0 }, "custom");
    if (ok) setCustom(null);
  };

  const bwNum = targets ? Number(targets.bw) : 0;
  const range = targets ? proteinRange(bwNum) : null;
  const saveTargets = async () => {
    const kcal = Number(targets.kcal), protein = Number(targets.protein);
    if (!(kcal > 0) || !(protein > 0)) { setToast("Enter a calorie and a protein target."); return; }
    setBusy(true);
    const body = { fuelTargets: { kcal: Math.round(kcal), protein: Math.round(protein) } };
    if (bwNum > 0) body.bodyweight = bwNum;
    const res = await call("/api/profile", { method: "PATCH", body: JSON.stringify(body) }, onSignedOut);
    if (!res.ok) { setBusy(false); setToast("Couldn't save your targets. Try again."); return; }
    await reload();
    setBusy(false);
    setTargets(null);
  };

  const selected = days.find((d) => d.date === day);

  return (
    <>
      <Header kicker={day === today ? "Today" : "Editing a past day"} title="Fuel"
        right={<Button variant="quiet" onClick={() => setTargets({ bw: profile.bodyweight ?? "", kcal: String(tgt.kcal), protein: String(tgt.protein) })}>Targets</Button>} />

      <ol aria-label="Last seven days" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: T.space[1] }}>
        {days.map((d) => {
          const has = dayTotals(rows, d.date).count > 0;
          const on = d.date === day;
          return (
            <li key={d.date}>
              <button type="button" className="wh-btn" aria-pressed={on} onClick={() => setDay(d.date)} aria-label={`${d.long}${has ? ", has entries" : ""}`}
                style={{ width: "100%", minHeight: 56, borderRadius: T.radius.chip, border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                  background: T.color.surface2, color: on ? T.color.text : T.color.muted, boxShadow: on ? `inset 0 0 0 2px ${T.color.energy}` : "none" }}>
                <span style={{ fontFamily: T.font.display, fontWeight: 600, fontSize: 11, letterSpacing: ".08em" }}>{d.weekday}</span>
                <b style={{ fontFamily: T.font.display, fontWeight: 800, fontSize: 16, lineHeight: 1 }}>{d.dom}</b>
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: has ? T.color.energy : "transparent" }} />
              </button>
            </li>
          );
        })}
      </ol>

      <Card style={{ padding: T.space[4] }}>
        <p style={{ ...kicker, marginBottom: T.space[3] }}>{selected ? selected.long : day}</p>
        <div style={{ display: "flex", gap: T.space[4], alignItems: "center" }}>
          <Ring score={proteinPct} label="% protein" size={104} />
          <div style={{ display: "grid", gap: T.space[3], minWidth: 0 }}>
            <Numeral value={fmtKcal(totals.kcal)} unit={`/ ${fmtKcal(tgt.kcal)} kcal`} size={36} />
            <Numeral value={Math.round(totals.protein)} unit={`/ ${tgt.protein} g protein`} size={36} color={T.color.recovery} />
          </div>
        </div>
        <Bar value={totals.kcal / tgt.kcal} label="Calories against target" style={{ marginTop: T.space[4] }} />
        <p style={{ ...muted, margin: `${T.space[2]}px 0 0` }}>
          {totals.kcal > tgt.kcal ? `Over by ${fmtKcal(totals.kcal - tgt.kcal)} kcal` : `${fmtKcal(tgt.kcal - totals.kcal)} kcal left`} · {Math.round(totals.carbs)} g carbs · {Math.round(totals.fat)} g fat
        </p>
      </Card>

      <h2 style={sectionTitle}>Quick add</h2>
      <div style={{ display: "flex", gap: T.space[2], flexWrap: "wrap" }}>
        {FUEL_QUICK.map((f) => (
          <Button key={f.name} variant="quiet" disabled={busy} onClick={() => add(f, "quick")}><Plus size={14} /> {f.name}</Button>
        ))}
      </div>

      <h2 style={sectionTitle}>Search foods</h2>
      <input className="wh-field" style={field} type="search" aria-label="Search foods" placeholder="Search foods" value={q} onChange={(e) => setQ(e.target.value)} />
      {results !== null && (
        results.length ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, background: T.color.surface, border: `1px solid ${T.color.line}`, borderRadius: T.radius.card }}>
            {results.map((r, i) => (
              <li key={`${r.name}-${i}`} style={{ borderTop: i ? `1px solid ${T.color.line}` : "none" }}>
                <button type="button" className="wh-btn" disabled={busy} onClick={() => add(r, "search", r.raw)} aria-label={`Add ${r.name}`}
                  style={{ display: "flex", width: "100%", minHeight: 56, alignItems: "center", gap: T.space[3], padding: `${T.space[2]}px ${T.space[3]}px`, background: "none", border: "none", color: T.color.text, textAlign: "left", cursor: "pointer", font: "inherit" }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 600, overflowWrap: "anywhere" }}>{r.name}{r.brand ? <span style={{ color: T.color.muted, fontWeight: 400 }}> · {r.brand}</span> : null}</span>
                    <span style={{ ...muted, display: "block" }}>{r.kcal} kcal · {r.protein} g P</span>
                  </span>
                  <Plus size={18} color={T.color.energy} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p role="status" style={muted}>{searchDown ? "Search is unavailable right now. Add it yourself below." : "Nothing found. Try a simpler term, or add it yourself."}</p>
        )
      )}
      <Button variant="ghost" onClick={() => setCustom({ name: "", kcal: "", protein: "", carbs: "", fat: "" })} style={{ alignSelf: "flex-start" }}>Add your own</Button>

      <h2 style={sectionTitle}>{day === today ? "Logged today" : "Logged this day"}</h2>
      <Card style={{ padding: 0 }}>
        {dayRows.length ? dayRows.map((r, i) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: T.space[2], padding: `${T.space[1]}px ${T.space[1]}px ${T.space[1]}px ${T.space[3]}px`, borderTop: i ? `1px solid ${T.color.line}` : "none" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: T.color.text, fontWeight: 600, overflowWrap: "anywhere" }}>{r.name}</div>
              <div style={muted}>{Math.round(r.calories || 0)} kcal · {Math.round(r.protein_g || 0)} g P · {Math.round(r.carbs_g || 0)} g C · {Math.round(r.fat_g || 0)} g F</div>
            </div>
            <button type="button" className="wh-ck" aria-label={`Delete ${r.name}`} disabled={busy} onClick={() => remove(r)} style={iconButton}><X size={18} /></button>
          </div>
        )) : <p style={{ ...muted, margin: 0, padding: T.space[3], fontSize: T.type.body }}>Nothing logged for this day.</p>}
      </Card>

      {custom && (
        <Sheet title="Add your own" onClose={() => setCustom(null)}>
          <div style={{ display: "grid", gap: T.space[3], marginTop: T.space[4] }}>
            <Field id="fuel-name" label="Name" value={custom.name} maxLength={80} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: T.space[3] }}>
              {[["kcal", "Calories"], ["protein", "Protein g"], ["carbs", "Carbs g"], ["fat", "Fat g"]].map(([k, l]) => (
                <Field key={k} id={`fuel-${k}`} label={l} type="number" inputMode="numeric" min="0" value={custom[k]} onChange={(e) => setCustom({ ...custom, [k]: e.target.value })} />
              ))}
            </div>
            <Button full busy={busy} disabled={!custom.name.trim()} onClick={saveCustom}>Add to log</Button>
          </div>
        </Sheet>
      )}

      {targets && (
        <Sheet title="Targets" onClose={() => setTargets(null)}>
          <div style={{ display: "grid", gap: T.space[3], marginTop: T.space[4] }}>
            <Field id="t-bw" label="Bodyweight (lb)" type="number" inputMode="decimal" min="0" value={targets.bw} onChange={(e) => setTargets({ ...targets, bw: e.target.value })} />
            {range && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: T.space[2], flexWrap: "wrap" }}>
                <p style={{ ...muted, margin: 0 }}>At {bwNum} lb, {range[0]}–{range[1]} g protein</p>
                <Button variant="quiet" onClick={() => setTargets({ ...targets, protein: String(range[1]) })}>Use {range[1]}</Button>
              </div>
            )}
            <Field id="t-protein" label="Protein target (g)" type="number" inputMode="numeric" min="0" value={targets.protein} onChange={(e) => setTargets({ ...targets, protein: e.target.value })} />
            <Field id="t-kcal" label="Calorie target" type="number" inputMode="numeric" min="0" value={targets.kcal} onChange={(e) => setTargets({ ...targets, kcal: e.target.value })} />
            <Button full busy={busy} onClick={saveTargets}>Save targets</Button>
          </div>
        </Sheet>
      )}
      <Toast message={toast} tone="warn" onDone={clearToast} />
    </>
  );
}
