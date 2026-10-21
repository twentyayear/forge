import React, { useState } from "react";
import { T } from "../theme.js";
import { Button, Chip, Header, Sheet } from "../ui/index.js";
import { cardButton, kicker, muted } from "../client/styles.js";
import { LoadState, Seg } from "./parts.jsx";
import { pickArray, useGet } from "./useGet.js";
import { WorkoutEditor } from "./WorkoutEditor.jsx";
import { ProgramEditor } from "./ProgramEditor.jsx";
import { BulkAssignSheet } from "./BulkAssignSheet.jsx";

const dateLabel = (ts) => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const setLine = (sets) => (sets || []).map((s) => (s.weight_lbs != null ? `${s.reps} × ${s.weight_lbs}` : `${s.reps} reps`)).join(" · ");

function ListRow({ title, sub, chip, onClick }) {
  return (
    <button type="button" className="wh-btn" onClick={onClick} style={{ ...cardButton, display: "flex", alignItems: "center", justifyContent: "space-between", gap: T.space[3], minHeight: 56 }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 600, color: T.color.text, fontSize: T.type.body, overflowWrap: "anywhere" }}>{title}</span>
        <span style={{ ...muted, display: "block" }}>{sub}</span>
      </span>
      {chip && <Chip>{chip}</Chip>}
    </button>
  );
}

// READ-ONLY LOOK AT A SAVED WORKOUT, WITH THE ROUTE INTO BULK ASSIGN.
function WorkoutSheet({ workout, onClose, onAssign }) {
  return (
    <Sheet title={workout.title} onClose={onClose}>
      <div style={{ display: "grid", gap: T.space[3], marginTop: T.space[4] }}>
        {workout.notes && <p style={{ margin: 0, color: T.color.body, fontSize: T.type.body, whiteSpace: "pre-wrap" }}>{workout.notes}</p>}
        {(workout.blocks || []).map((b, i) => (
          <div key={i} style={{ background: T.color.surface2, borderRadius: T.radius.control, padding: T.space[3] }}>
            <div style={{ color: T.color.text, fontWeight: 600 }}>{b.exercise_key}</div>
            <div style={muted}>{setLine(b.sets)}{b.rest_sec ? ` · rest ${b.rest_sec}s` : ""}</div>
            {b.note && <div style={{ ...muted, fontStyle: "italic" }}>{b.note}</div>}
          </div>
        ))}
        <Button full onClick={onAssign}>Assign to clients…</Button>
      </div>
    </Sheet>
  );
}

export function Build({ clients, onSignedOut, notify }) {
  const [seg, setSeg] = useState("workouts");
  const [screen, setScreen] = useState(null); // null | { kind: "workout" } | { kind: "program", id }
  const [viewing, setViewing] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const workouts = useGet("/api/admin/workouts", onSignedOut, pickArray);
  const programs = useGet("/api/admin/programs", onSignedOut, pickArray);
  const back = () => setScreen(null);

  if (screen && screen.kind === "workout") {
    return <WorkoutEditor onBack={back} onSignedOut={onSignedOut} onSaved={(m) => { notify(m); workouts.reload(); back(); }} />;
  }
  if (screen && screen.kind === "program") {
    return (
      <ProgramEditor key={screen.id || "new"} programId={screen.id} workouts={workouts.data} clients={clients} onBack={back} notify={notify}
        onSaved={programs.reload} onOpen={(id) => setScreen({ kind: "program", id })} onSignedOut={onSignedOut} />
    );
  }

  const wk = workouts.data || [];
  const pg = programs.data || [];
  return (
    <section aria-label="Build" style={{ display: "grid", gap: T.space[3], alignContent: "start" }}>
      <Header kicker="Console" title="Build" />
      <Seg label="Build sections" value={seg} onChange={setSeg} items={[{ id: "workouts", label: "Workouts" }, { id: "programs", label: "Programs" }]} />
      {seg === "workouts" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: T.space[3] }}>
            <h2 style={kicker}>Saved workouts · {wk.length}</h2>
            <Chip tone="energy" onClick={() => setScreen({ kind: "workout" })}>+ New workout</Chip>
          </div>
          <LoadState res={workouts} what="your workouts" />
          {workouts.data && wk.length === 0 && <p style={{ ...muted, fontSize: T.type.body }}>No workouts yet. Build your first one.</p>}
          <div style={{ display: "grid", gap: T.space[2] }}>
            {wk.map((w) => <ListRow key={w.id} title={w.title} sub={`${plural((w.blocks || []).length, "exercise")} · ${dateLabel(w.created_at)}`} onClick={() => setViewing(w)} />)}
          </div>
        </>
      )}
      {seg === "programs" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: T.space[3] }}>
            <h2 style={kicker}>Programs · {pg.length}</h2>
            <Chip tone="energy" onClick={() => setScreen({ kind: "program", id: null })}>+ New program</Chip>
          </div>
          <LoadState res={programs} what="your programs" />
          {programs.data && pg.length === 0 && <p style={{ ...muted, fontSize: T.type.body }}>No programs yet. A program is an ordered list of days you enrol clients in.</p>}
          <div style={{ display: "grid", gap: T.space[2] }}>
            {pg.map((p) => (
              <ListRow key={p.id} title={p.title} chip={`${p.enrollment_count || 0} enrolled`}
                sub={`${plural(p.day_count || 0, "day")} · ${plural(p.session_count || 0, "session")}`} onClick={() => setScreen({ kind: "program", id: p.id })} />
            ))}
          </div>
        </>
      )}
      {viewing && !assigning && <WorkoutSheet workout={viewing} onClose={() => setViewing(null)} onAssign={() => { setAssigning(viewing); setViewing(null); }} />}
      {assigning && (
        <BulkAssignSheet workout={assigning} clients={clients} onClose={() => setAssigning(null)} onSignedOut={onSignedOut}
          onDone={(m) => { setAssigning(null); notify(m); }} />
      )}
    </section>
  );
}
