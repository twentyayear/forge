import React, { useState } from "react";
import { T } from "../theme.js";
import { Button, Sheet } from "../ui/index.js";
import { post } from "../client/net.js";
import { todayStr } from "../client/engine.js";
import { field, fieldLabel } from "../client/styles.js";
import { iso } from "../data/dates.js";
import { ClientPick, ErrorText } from "./parts.jsx";
import { countOf } from "./trainer.js";

const tomorrow = () => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)); };

// ONE WORKOUT, MANY CLIENTS, ONE DAY: POST /api/admin/assignments/bulk WITH IDS TAKEN ONLY FROM THE ROSTER.
export function BulkAssignSheet({ workout, clients, onClose, onDone, onSignedOut }) {
  const [picked, setPicked] = useState([]);
  const [date, setDate] = useState(tomorrow());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const toggle = (id) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 50 ? cur : [...cur, id]));

  const submit = async () => {
    if (!picked.length) { setErr("Pick at least one client."); return; }
    if (!date || date < todayStr()) { setErr("Pick today or a later date."); return; }
    setBusy(true); setErr("");
    const res = await post("/api/admin/assignments/bulk", { workout_id: workout.id, user_ids: picked, scheduled_for: date }, onSignedOut);
    setBusy(false);
    if (res.ok && res.data) {
      const n = countOf(res.data.created);
      const m = countOf(res.data.skipped);
      onDone(`Assigned to ${n} client${n === 1 ? "" : "s"} (${m} already had it)`);
    } else setErr("Couldn't assign. Try again.");
  };

  return (
    <Sheet title="Assign to clients" onClose={onClose}>
      <div style={{ display: "grid", gap: T.space[3], marginTop: T.space[4] }}>
        <p style={{ margin: 0, color: T.color.text, fontWeight: 600 }}>{workout.title}</p>
        <div>
          <span style={fieldLabel}>Clients · {picked.length}</span>
          <ClientPick label="Clients" clients={clients} selected={picked} onToggle={toggle} />
        </div>
        <div>
          <label htmlFor="ba-date" style={fieldLabel}>Date</label>
          <input id="ba-date" className="wh-field" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={field} />
        </div>
        <ErrorText>{err}</ErrorText>
        <Button full busy={busy} onClick={submit}>{picked.length ? `Assign to ${picked.length} client${picked.length === 1 ? "" : "s"}` : "Assign"}</Button>
      </div>
    </Sheet>
  );
}
