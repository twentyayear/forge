import React, { useMemo, useRef, useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { T } from "../theme.js";
import { Button, Card, Header, Sheet } from "../ui/index.js";
import { post } from "../client/net.js";
import { field, fieldLabel, kicker, muted, iconButton } from "../client/styles.js";
import { EX_LIB } from "../data/exercises.js";
import { BackLink, ErrorText, ToggleChip } from "./parts.jsx";
import { blocksFromEditor } from "./trainer.js";

const EQUIPMENT = [...new Set(EX_LIB.map((e) => e.equipment))];
const small = { ...field, minHeight: 44, padding: `0 ${T.space[3]}px`, textAlign: "center", fontFamily: T.font.display, fontWeight: 700, fontSize: 18, fontVariantNumeric: "tabular-nums" };

function ExercisePicker({ onAdd, onClose, added }) {
  const [q, setQ] = useState("");
  const [equip, setEquip] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return EX_LIB.filter((e) => (!equip || e.equipment === equip) && (!needle || `${e.name} ${e.muscles}`.toLowerCase().includes(needle)));
  }, [q, equip]);
  return (
    <Sheet title="Add exercises" onClose={onClose}>
      <div style={{ display: "grid", gap: T.space[3], marginTop: T.space[4] }}>
        <input className="wh-field" type="search" aria-label="Search exercises" placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} style={field} />
        <div role="group" aria-label="Equipment" style={{ display: "flex", flexWrap: "wrap", gap: T.space[2] }}>
          {EQUIPMENT.map((eq) => <ToggleChip key={eq} on={equip === eq} onClick={() => setEquip(equip === eq ? "" : eq)}>{eq}</ToggleChip>)}
        </div>
        {shown.length === 0 && <p style={muted}>No exercise matches that search.</p>}
        <div style={{ display: "grid", gap: T.space[2], maxHeight: 280, overflowY: "auto" }}>
          {shown.map((e) => (
            <button key={e.name} type="button" className="wh-btn" onClick={() => onAdd(e.name)}
              style={{ textAlign: "left", minHeight: 48, padding: `${T.space[2]}px ${T.space[3]}px`, cursor: "pointer", font: "inherit", color: T.color.text,
                background: T.color.surface2, border: `1px solid ${T.color.line}`, borderRadius: T.radius.control }}>
              <span style={{ display: "block", fontWeight: 600 }}>{e.name}</span>
              <span style={muted}>{e.equipment} · {e.muscles}</span>
            </button>
          ))}
        </div>
        <Button full onClick={onClose}>{added > 0 ? `Done · ${added} added` : "Done"}</Button>
      </div>
    </Sheet>
  );
}

// ONE FULL-PAGE EDITOR: TITLE, NOTES, THEN EXERCISES EACH WITH ITS OWN SET ROWS, REST AND NOTE.
export function WorkoutEditor({ onBack, onSaved, onSignedOut }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [exercises, setExercises] = useState([]);
  const [picking, setPicking] = useState(false);
  const [added, setAdded] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const uid = useRef(0);

  const patchEx = (i, patch) => setExercises((cur) => cur.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  const patchSet = (i, si, patch) => setExercises((cur) => cur.map((e, k) => (k === i ? { ...e, sets: e.sets.map((s, sk) => (sk === si ? { ...s, ...patch } : s)) } : e)));
  const addSet = (i) => setExercises((cur) => cur.map((e, k) => (k === i ? { ...e, sets: [...e.sets, { ...e.sets[e.sets.length - 1] }] } : e)));
  const dropSet = (i) => setExercises((cur) => cur.map((e, k) => (k === i && e.sets.length > 1 ? { ...e, sets: e.sets.slice(0, -1) } : e)));
  const add = (name) => {
    uid.current += 1;
    setExercises((cur) => [...cur, { uid: uid.current, exercise_key: name, sets: [{ reps: 8, weight_lbs: "" }], rest_sec: "", note: "" }]);
    setAdded((n) => n + 1);
  };

  const save = async () => {
    setErr("");
    if (!title.trim()) { setErr("Give the workout a title."); return; }
    if (!exercises.length) { setErr("Add at least one exercise."); return; }
    setBusy(true);
    const body = { title: title.trim(), blocks: blocksFromEditor(exercises) };
    if (notes.trim()) body.notes = notes.trim();
    const res = await post("/api/admin/workouts", body, onSignedOut);
    setBusy(false);
    if (res.ok) onSaved("Workout saved");
    else if (res.status === 400) setErr("The server couldn't accept those exercises. Check the title (120 characters at most), reps and weights.");
    else setErr("Couldn't save the workout. Try again.");
  };

  return (
    <section aria-label="New workout" style={{ display: "grid", gap: T.space[3], alignContent: "start" }}>
      <BackLink label="Workouts" onBack={onBack} />
      <Header kicker="Build" title="New workout" />
      <div>
        <label htmlFor="we-title" style={fieldLabel}>Title</label>
        <input id="we-title" className="wh-field" type="text" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} style={field} />
      </div>
      <div>
        <label htmlFor="we-notes" style={fieldLabel}>Notes (optional)</label>
        <textarea id="we-notes" className="wh-field" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...field, padding: T.space[3], resize: "vertical", lineHeight: "22px" }} />
      </div>
      <h2 style={{ ...kicker, marginTop: T.space[2] }}>Exercises · {exercises.length}</h2>
      {exercises.length === 0 && <p style={{ ...muted, fontSize: T.type.body }}>No exercises yet. Add the first one.</p>}
      {exercises.map((e, i) => (
        <Card key={e.uid} style={{ display: "grid", gap: T.space[3] }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: T.space[2] }}>
            <span style={{ fontFamily: T.font.display, fontWeight: 700, fontSize: 20, color: T.color.text, minWidth: 0, overflowWrap: "anywhere" }}>{e.exercise_key}</span>
            <button type="button" className="wh-ck" aria-label={`Remove ${e.exercise_key}`} onClick={() => setExercises((cur) => cur.filter((_, k) => k !== i))} style={iconButton}><Trash2 size={18} /></button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 1fr", gap: T.space[2], alignItems: "center" }}>
            <span style={kicker}>Set</span><span style={{ ...kicker, textAlign: "center" }}>Reps</span><span style={{ ...kicker, textAlign: "center" }}>lb</span>
            {e.sets.map((s, si) => (
              <React.Fragment key={si}>
                <span style={{ fontFamily: T.font.display, fontWeight: 700, color: T.color.muted }}>{si + 1}</span>
                <input className="wh-field" type="number" inputMode="numeric" min={1} aria-label={`${e.exercise_key} set ${si + 1} reps`} value={s.reps} onChange={(ev) => patchSet(i, si, { reps: ev.target.value })} style={small} />
                <input className="wh-field" type="number" inputMode="decimal" min={0} placeholder="BW" aria-label={`${e.exercise_key} set ${si + 1} weight in pounds`} value={s.weight_lbs} onChange={(ev) => patchSet(i, si, { weight_lbs: ev.target.value })} style={small} />
              </React.Fragment>
            ))}
          </div>
          <div style={{ display: "flex", gap: T.space[2] }}>
            <Button variant="quiet" onClick={() => addSet(i)} aria-label={`Add a set to ${e.exercise_key}`}><Plus size={16} /> Set</Button>
            <Button variant="ghost" disabled={e.sets.length <= 1} onClick={() => dropSet(i)} aria-label={`Remove the last set of ${e.exercise_key}`}><Minus size={16} /> Set</Button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)", gap: T.space[2] }}>
            <div>
              <label htmlFor={`we-rest-${e.uid}`} style={fieldLabel}>Rest (sec)</label>
              <input id={`we-rest-${e.uid}`} className="wh-field" type="number" inputMode="numeric" min={0} value={e.rest_sec} onChange={(ev) => patchEx(i, { rest_sec: ev.target.value })} style={{ ...field, minHeight: 44 }} />
            </div>
            <div>
              <label htmlFor={`we-note-${e.uid}`} style={fieldLabel}>Note</label>
              <input id={`we-note-${e.uid}`} className="wh-field" type="text" value={e.note} onChange={(ev) => patchEx(i, { note: ev.target.value })} style={{ ...field, minHeight: 44 }} />
            </div>
          </div>
        </Card>
      ))}
      <Button variant="quiet" onClick={() => { setAdded(0); setPicking(true); }}>+ Add exercise</Button>
      <ErrorText>{err}</ErrorText>
      <Button full busy={busy} onClick={save}>Save workout</Button>
      {picking && <ExercisePicker added={added} onAdd={add} onClose={() => setPicking(false)} />}
    </section>
  );
}
