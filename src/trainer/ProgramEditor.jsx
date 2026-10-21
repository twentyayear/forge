import React, { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { T } from "../theme.js";
import { Button, Card, Header } from "../ui/index.js";
import { call, post } from "../client/net.js";
import { todayStr, dayOf } from "../client/engine.js";
import { field, fieldLabel, kicker, muted, iconButton } from "../client/styles.js";
import { iso } from "../data/dates.js";
import { BackLink, ClientPick, ErrorText, LoadState } from "./parts.jsx";
import { useGet } from "./useGet.js";
import { countOf, moveItem, programSessionCount } from "./trainer.js";

const pickProgram = (d) => (d && Array.isArray(d.days) ? d : null);
const tomorrow = () => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)); };
const shortDate = (s) => { const [y, m, d] = dayOf(s).split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" }); };
const selectStyle = { ...field, minHeight: 44, padding: `0 ${T.space[3]}px` };

// THE ENROL CARD: CLIENT CHIPS, A START DATE AND THE BUTTON THAT NAMES HOW MANY SESSIONS IT WILL WRITE (CLIENTS × THE SAVED PROGRAM'S SESSIONS).
function EnrolCard({ programId, sessions, dirty, clients, enrollments, onDone, onSignedOut }) {
  const [picked, setPicked] = useState([]);
  const [date, setDate] = useState(tomorrow());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const toggle = (id) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 50 ? cur : [...cur, id]));

  const submit = async () => {
    if (!picked.length) { setErr("Pick at least one client."); return; }
    if (!date || date < todayStr()) { setErr("Pick today or a later date."); return; }
    setBusy(true); setErr("");
    const res = await post(`/api/admin/programs/${programId}/enroll`, { user_ids: picked, start_date: date }, onSignedOut);
    setBusy(false);
    if (res.ok && res.data) {
      setPicked([]);
      onDone(`${countOf(res.data.enrolled)} enrolled, ${countOf(res.data.assignments_created)} sessions scheduled, ${countOf(res.data.skipped)} already enrolled`);
    } else setErr("Couldn't enrol. Try again.");
  };

  return (
    <Card accent style={{ display: "grid", gap: T.space[3] }}>
      <h2 style={kicker}>Enrol clients</h2>
      <ClientPick label="Clients to enrol" clients={clients} selected={picked} onToggle={toggle} />
      <div>
        <label htmlFor="pe-start" style={fieldLabel}>Start date</label>
        <input id="pe-start" className="wh-field" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={field} />
      </div>
      {dirty && <p style={muted}>Save your changes first. Enrolling uses the saved program.</p>}
      <ErrorText>{err}</ErrorText>
      <Button full busy={busy} disabled={dirty || sessions === 0} onClick={submit}>
        {picked.length ? `Enrol ${picked.length} client${picked.length === 1 ? "" : "s"} · ${picked.length * sessions} sessions` : "Enrol clients"}
      </Button>
      {sessions === 0 && <p style={muted}>Add at least one workout day before enrolling.</p>}
      <h2 style={{ ...kicker, marginTop: T.space[2] }}>Enrolled · {enrollments.length}</h2>
      {enrollments.length === 0 && <p style={muted}>Nobody is enrolled yet.</p>}
      {enrollments.map((e) => (
        <div key={`${e.user_id}:${e.start_date}`} style={{ display: "flex", justifyContent: "space-between", gap: T.space[3] }}>
          <span style={{ color: T.color.text, fontWeight: 600 }}>{e.user_name}</span>
          <span style={muted}>starts {shortDate(e.start_date)}</span>
        </div>
      ))}
    </Card>
  );
}

// programId null = A NEW PROGRAM; OTHERWISE THE SAVED ONE IS LOADED, EDITED IN PLACE AND ENROLLED FROM THE SAME PAGE.
export function ProgramEditor({ programId, workouts, clients, onBack, onSaved, onOpen, onSignedOut, notify }) {
  const existing = useGet(programId ? `/api/admin/programs/${programId}` : null, onSignedOut, pickProgram);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [days, setDays] = useState([{ workout_id: null, note: "" }]);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const saved = existing.data;

  // FILL THE FORM ONCE FROM THE SERVER; LATER RELOADS (AFTER AN ENROLMENT) ONLY REFRESH THE ENROLLED LIST.
  useEffect(() => {
    if (!saved || loaded) return;
    setTitle(saved.title || "");
    setDescription(saved.description || "");
    const sorted = [...saved.days].sort((a, b) => a.day_index - b.day_index);
    setDays(sorted.length ? sorted.map((d) => ({ workout_id: d.workout_id ?? null, note: d.note || "" })) : [{ workout_id: null, note: "" }]);
    setLoaded(true);
  }, [saved, loaded]);

  const edit = (fn) => { setDirty(true); fn(); };
  const patchDay = (i, patch) => edit(() => setDays((cur) => cur.map((d, k) => (k === i ? { ...d, ...patch } : d))));

  const save = async () => {
    setErr("");
    if (!title.trim()) { setErr("Give the program a title."); return; }
    setBusy(true);
    const body = { title: title.trim(), description: description.trim(), days: days.map((d, i) => ({ day_index: i, workout_id: d.workout_id, ...(d.note.trim() ? { note: d.note.trim() } : {}) })) };
    const res = programId
      ? await call(`/api/admin/programs/${programId}`, { method: "PATCH", body: JSON.stringify(body) }, onSignedOut)
      : await post("/api/admin/programs", body, onSignedOut);
    setBusy(false);
    if (res.ok) {
      setDirty(false);
      onSaved();
      if (!programId && res.data && res.data.id) { notify("Program saved"); onOpen(res.data.id); }
      else { notify("Program saved"); existing.reload(); }
    } else if (res.status === 400) setErr("The server couldn't accept that program. Check the title and the days.");
    else setErr("Couldn't save the program. Try again.");
  };

  const remove = async () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    const res = await call(`/api/admin/programs/${programId}`, { method: "DELETE" }, onSignedOut);
    if (res.ok) { notify("Program deleted"); onSaved(); onBack(); }
    else if (res.status === 409) { setConfirmDel(false); setErr("Clients are enrolled in this program, so it can't be deleted."); }
    else { setConfirmDel(false); setErr("Couldn't delete the program. Try again."); }
  };

  if (programId && !loaded) {
    return (
      <section aria-label="Program" style={{ display: "grid", gap: T.space[3], alignContent: "start" }}>
        <BackLink label="Programs" onBack={onBack} />
        <LoadState res={existing} what="this program" />
      </section>
    );
  }

  const list = workouts || [];
  const sessions = programSessionCount(saved ? saved.days : []);
  return (
    <section aria-label={programId ? "Edit program" : "New program"} style={{ display: "grid", gap: T.space[3], alignContent: "start", minWidth: 0 }}>
      <BackLink label="Programs" onBack={onBack} />
      <Header kicker="Program" title={programId ? title || "Program" : "New program"} />
      <div>
        <label htmlFor="pe-title" style={fieldLabel}>Title</label>
        <input id="pe-title" className="wh-field" type="text" value={title} onChange={(e) => edit(() => setTitle(e.target.value))} style={field} />
      </div>
      <div>
        <label htmlFor="pe-desc" style={fieldLabel}>Description (optional)</label>
        <textarea id="pe-desc" className="wh-field" rows={2} value={description} onChange={(e) => edit(() => setDescription(e.target.value))} style={{ ...field, padding: T.space[3], resize: "vertical", lineHeight: "22px" }} />
      </div>
      <h2 style={{ ...kicker, marginTop: T.space[2] }}>Days · {days.length} · {programSessionCount(days)} sessions</h2>
      {workouts && list.length === 0 && <p style={muted}>You have no saved workouts yet. Build one first; every day here is a saved workout or a rest day.</p>}
      <div style={{ display: "grid", gap: T.space[2] }}>
        {days.map((d, i) => (
          <Card key={i} style={{ display: "grid", gap: T.space[2] }}>
            <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
              <span style={{ ...kicker, width: 48, flexShrink: 0 }}>Day {i + 1}</span>
              <select className="wh-field" aria-label={`Day ${i + 1} workout`} value={d.workout_id ?? ""} onChange={(e) => patchDay(i, { workout_id: e.target.value === "" ? null : Number(e.target.value) })} style={{ ...selectStyle, flex: 1, minWidth: 0 }}>
                <option value="">Rest</option>
                {list.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
              </select>
              <button type="button" className="wh-ck" aria-label={`Move day ${i + 1} up`} disabled={i === 0} onClick={() => edit(() => setDays((cur) => moveItem(cur, i, -1)))} style={{ ...iconButton, opacity: i === 0 ? 0.35 : 1 }}><ArrowUp size={18} /></button>
              <button type="button" className="wh-ck" aria-label={`Move day ${i + 1} down`} disabled={i === days.length - 1} onClick={() => edit(() => setDays((cur) => moveItem(cur, i, 1)))} style={{ ...iconButton, opacity: i === days.length - 1 ? 0.35 : 1 }}><ArrowDown size={18} /></button>
              <button type="button" className="wh-ck" aria-label={`Remove day ${i + 1}`} disabled={days.length <= 1} onClick={() => edit(() => setDays((cur) => cur.filter((_, k) => k !== i)))} style={{ ...iconButton, opacity: days.length <= 1 ? 0.35 : 1 }}><Trash2 size={18} /></button>
            </div>
            <input className="wh-field" type="text" aria-label={`Day ${i + 1} note`} placeholder="Note (optional)" value={d.note} onChange={(e) => patchDay(i, { note: e.target.value })} style={{ ...field, minHeight: 44 }} />
          </Card>
        ))}
      </div>
      <Button variant="quiet" onClick={() => edit(() => setDays((cur) => [...cur, { workout_id: null, note: "" }]))}>+ Add day</Button>
      <ErrorText>{err}</ErrorText>
      <Button full busy={busy} onClick={save}>Save program</Button>
      {programId && saved && (
        <>
          <EnrolCard programId={programId} sessions={sessions} dirty={dirty} clients={clients} enrollments={saved.enrollments || []}
            onDone={(m) => { notify(m); existing.reload(); onSaved(); }} onSignedOut={onSignedOut} />
          <Button variant="ghost" onClick={remove}>{confirmDel ? "Tap again to delete this program" : "Delete program"}</Button>
        </>
      )}
    </section>
  );
}
