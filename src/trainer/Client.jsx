import React, { useCallback, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { T } from "../theme.js";
import { Button, Card, Chip, Header, Ring, Sheet, Toast } from "../ui/index.js";
import { call, post } from "../client/net.js";
import { dayOf, todayStr } from "../client/engine.js";
import { field, fieldLabel, kicker, muted } from "../client/styles.js";
import { iso } from "../data/dates.js";
import { useGet } from "./useGet.js";
import { Switch } from "./parts.jsx";
import { Thread } from "./Thread.jsx";
import { trendPoints, weekRange } from "./trainer.js";

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); return iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); };
const shortDate = (s) => parse(dayOf(s)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const pickArray = (d) => (Array.isArray(d) ? d : null);
const pickOverview = (d) => (d && d.user && Array.isArray(d.checkins) ? d : null);

const CELL = {
  done: { background: T.color.energyDeep, color: T.color.onDeep, border: `1px solid ${T.color.energyDeep}` },
  missed: { background: T.color.warnBg, color: T.color.warn, border: `1px solid ${T.color.warn}` },
  skipped: { background: "transparent", color: T.color.muted, border: `1px dashed ${T.color.lineStrong}` },
  assigned: { background: T.color.surface2, color: T.color.text, border: `1px solid ${T.color.energy}` },
  rest: { background: T.color.surface, color: T.color.muted, border: `1px solid ${T.color.line}` },
};
const WORD = { done: "completed", missed: "missed", skipped: "skipped", assigned: "scheduled", rest: "no session" };

function cellState(a, day, today) {
  if (!a) return "rest";
  if (a.status === "completed") return "done";
  if (a.status === "skipped") return "skipped";
  return day < today ? "missed" : "assigned";
}

function PickList({ items, selectedId, onPick, render, label }) {
  return (
    <div role="listbox" aria-label={label} style={{ display: "grid", gap: T.space[2], maxHeight: 260, overflowY: "auto" }}>
      {items.map((it) => {
        const on = it.id === selectedId;
        return (
          <button key={it.id} type="button" role="option" aria-selected={on} className="wh-btn" onClick={() => onPick(it.id)}
            style={{ textAlign: "left", minHeight: 48, padding: `${T.space[2]}px ${T.space[3]}px`, cursor: "pointer", font: "inherit", color: T.color.text,
              background: on ? T.color.energyWash : T.color.surface2, border: `1px solid ${on ? T.color.energy : T.color.line}`, borderRadius: T.radius.control }}>
            {render(it)}
          </button>
        );
      })}
    </div>
  );
}

function AssignSheet({ clientId, today, onClose, onDone, onSignedOut }) {
  const list = useGet("/api/admin/workouts", onSignedOut, pickArray);
  const [q, setQ] = useState("");
  const [date, setDate] = useState(addDays(today, 1));
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const shown = (list.data || []).filter((w) => w.title.toLowerCase().includes(q.trim().toLowerCase()));

  const submit = async () => {
    if (!pick) { setErr("Pick a session first."); return; }
    setBusy(true); setErr("");
    const res = await post("/api/admin/assignments", { user_id: clientId, workout_id: pick, scheduled_for: date }, onSignedOut);
    setBusy(false);
    if (res.status === 201) onDone("Session assigned");
    else if (res.status === 409) setErr("That session is already assigned for that day.");
    else setErr("Couldn't assign. Try again.");
  };

  return (
    <Sheet title="Assign a session" onClose={onClose}>
      <div style={{ display: "grid", gap: T.space[3], marginTop: T.space[4] }}>
        <div>
          <label htmlFor="as-date" style={fieldLabel}>Date</label>
          <input id="as-date" className="wh-field" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={field} />
        </div>
        <div>
          <label htmlFor="as-q" style={fieldLabel}>Session</label>
          <input id="as-q" className="wh-field" type="search" placeholder="Search your sessions" value={q} onChange={(e) => setQ(e.target.value)} style={field} />
        </div>
        {!list.data && list.loading && <p role="status" style={muted}>Loading</p>}
        {!list.data && list.error && <p role="alert" style={{ ...muted, color: T.color.warn }}>Couldn't load your sessions.</p>}
        {list.data && list.data.length === 0 && <p style={muted}>You have no saved sessions yet. Build one in the Build tab.</p>}
        {list.data && list.data.length > 0 && shown.length === 0 && <p style={muted}>No session matches that search.</p>}
        {shown.length > 0 && (
          <PickList label="Sessions" items={shown} selectedId={pick} onPick={setPick}
            render={(w) => (<><span style={{ display: "block", fontWeight: 600 }}>{w.title}</span><span style={muted}>{(w.blocks || []).length} exercises</span></>)} />
        )}
        {err && <p role="alert" style={{ margin: 0, color: T.color.warn, fontSize: T.type.small }}>{err}</p>}
        <Button full busy={busy} onClick={submit}>Assign</Button>
      </div>
    </Sheet>
  );
}

function EnrolSheet({ clientId, today, onClose, onDone, onSignedOut }) {
  const list = useGet("/api/admin/programs", onSignedOut, pickArray);
  const [date, setDate] = useState(addDays(today, 1));
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!pick) { setErr("Pick a program first."); return; }
    setBusy(true); setErr("");
    const res = await post(`/api/admin/programs/${pick}/enroll`, { user_ids: [clientId], start_date: date }, onSignedOut);
    setBusy(false);
    if (res.ok && res.data) {
      const n = res.data.assignments_created || 0;
      onDone(n === 0 ? "Nothing new to schedule" : `${n} session${n === 1 ? "" : "s"} scheduled`);
    } else setErr("Couldn't enrol. Try again.");
  };

  return (
    <Sheet title="Enrol in a program" onClose={onClose}>
      <div style={{ display: "grid", gap: T.space[3], marginTop: T.space[4] }}>
        <div>
          <label htmlFor="en-date" style={fieldLabel}>Start date</label>
          <input id="en-date" className="wh-field" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={field} />
        </div>
        {!list.data && list.loading && <p role="status" style={muted}>Loading</p>}
        {!list.data && list.error && <p role="alert" style={{ ...muted, color: T.color.warn }}>Couldn't load your programs.</p>}
        {list.data && list.data.length === 0 && <p style={muted}>You have no programs yet.</p>}
        {list.data && list.data.length > 0 && (
          <PickList label="Programs" items={list.data} selectedId={pick} onPick={setPick}
            render={(p) => (<><span style={{ display: "block", fontWeight: 600 }}>{p.title}</span><span style={muted}>{p.session_count} sessions over {p.day_count} days</span></>)} />
        )}
        {err && <p role="alert" style={{ margin: 0, color: T.color.warn, fontSize: T.type.small }}>{err}</p>}
        <Button full busy={busy} onClick={submit}>Enrol</Button>
      </div>
    </Sheet>
  );
}

function Trend({ points }) {
  const has = points.some((p) => p.score !== null);
  if (!has) return <p style={muted}>No check-ins in the last 30 days.</p>;
  return (
    <div role="img" aria-label="Readiness over the last 30 days" style={{ width: "100%", height: 140 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={T.color.line} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: T.color.muted, fontSize: 11 }} stroke={T.color.line} interval={6} tickLine={false} />
          <YAxis domain={[0, 100]} width={28} tick={{ fill: T.color.muted, fontSize: 11 }} stroke={T.color.line} tickLine={false} ticks={[0, 50, 100]} />
          <Tooltip contentStyle={{ background: T.color.surface2, border: `1px solid ${T.color.line}`, borderRadius: T.radius.control, color: T.color.text }}
            labelStyle={{ color: T.color.muted }} itemStyle={{ color: T.color.text }} formatter={(v) => [v, "Readiness"]} />
          <Line type="monotone" dataKey="score" stroke={T.color.energy} strokeWidth={2} dot={{ r: 2, fill: T.color.energy, stroke: T.color.energy }}
            connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Client({ id, narrow, onBack, onSignedOut, onChanged }) {
  const today = todayStr();
  const range = weekRange(today);
  const horizon = addDays(range.from, 55);
  const overview = useGet(`/api/admin/users/${id}/overview`, onSignedOut, pickOverview);
  const calendar = useGet(`/api/admin/calendar?from=${range.from}&to=${horizon}`, onSignedOut, pickArray);
  const [selDay, setSelDay] = useState(today);
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState("");
  const [switchBusy, setSwitchBusy] = useState(false);
  const [autoOverride, setAutoOverride] = useState(null);
  const clearToast = useCallback(() => setToast(""), []);

  const mine = useMemo(() => (calendar.data || []).filter((a) => a.user_id === id), [calendar.data, id]);
  const byDay = useMemo(() => {
    const map = new Map();
    for (const a of mine) if (!map.has(a.scheduled_for)) map.set(a.scheduled_for, a);
    return map;
  }, [mine]);
  const programOf = useMemo(() => new Map(mine.map((a) => [a.id, a.program_title])), [mine]);

  const refreshAll = () => { overview.reload(); calendar.reload(); onChanged(); };

  if (!overview.data) {
    return (
      <section aria-label="Client" style={{ display: "grid", gap: T.space[3], alignContent: "start" }}>
        {narrow && <BackLink onBack={onBack} />}
        {overview.loading && <p role="status" style={muted}>Loading</p>}
        {overview.error && (
          <div role="alert" style={{ display: "grid", gap: T.space[3], justifyItems: "start" }}>
            <p style={{ margin: 0, color: T.color.warn }}>Couldn't load this client.</p>
            <Button variant="quiet" onClick={overview.reload}>Try again</Button>
          </div>
        )}
      </section>
    );
  }

  const o = overview.data;
  const week = LETTERS.map((label, i) => {
    const date = addDays(range.from, i);
    const a = byDay.get(date);
    return { date, label, a, state: cellState(a, date, today) };
  });
  const picked = byDay.get(selDay) || null;
  const todayScore = (o.checkins.find((c) => dayOf(c.day) === today) || {}).score;
  const points = trendPoints(o.checkins, 30, today);
  const titleOf = new Map(o.assignments.map((a) => [a.id, a.workout.title]));
  const upcoming = o.assignments.filter((a) => dayOf(a.scheduled_for) >= today).sort((a, b) => dayOf(a.scheduled_for).localeCompare(dayOf(b.scheduled_for))).slice(0, 6);
  const recent = o.workoutLogs.slice(0, 5);
  const autoSend = autoOverride ?? o.profile?.kyleAutoSend === true;

  const setStatus = async (a, status) => {
    const res = await call(`/api/admin/assignments/${a.id}`, { method: "PATCH", body: JSON.stringify({ status }) }, onSignedOut);
    if (res.ok) { setToast(status === "skipped" ? "Session skipped" : "Session restored"); refreshAll(); }
    else setToast("Couldn't update that session. Try again.");
  };

  const changeAuto = async (v) => {
    setAutoOverride(v); setSwitchBusy(true);
    const res = await call(`/api/admin/users/${id}/settings`, { method: "PATCH", body: JSON.stringify({ kyleAutoSend: v }) }, onSignedOut);
    setSwitchBusy(false);
    if (res.ok) overview.reload();
    else { setAutoOverride(null); setToast("Couldn't save that setting. Try again."); }
  };

  const done = (message) => { setSheet(null); setToast(message); refreshAll(); };
  const h2 = { ...kicker, marginTop: T.space[2] };

  return (
    <section aria-label={`Client ${o.user.name}`} style={{ display: "grid", gap: T.space[3], alignContent: "start", minWidth: 0 }}>
      {narrow && <BackLink onBack={onBack} />}
      <Header kicker={o.user.email} title={o.user.name} />

      <h2 style={h2}>This week</h2>
      <ol aria-label="This week" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: T.space[1] }}>
        {week.map((d) => {
          const on = d.date === selDay;
          return (
            <li key={d.date}>
              <button type="button" className="wh-btn" onClick={() => setSelDay(d.date)} aria-pressed={on}
                aria-label={`${parse(d.date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}: ${WORD[d.state]}`}
                style={{ ...CELL[d.state], width: "100%", minHeight: 56, borderRadius: T.radius.chip, cursor: "pointer", font: "inherit", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                  outline: on ? `2px solid ${T.color.recovery}` : "none", outlineOffset: 1 }}>
                <b style={{ fontFamily: T.font.display, fontWeight: 800, fontSize: 16, lineHeight: 1 }}>{d.label}</b>
                <span style={{ fontFamily: T.font.display, fontWeight: 600, fontSize: 11, letterSpacing: ".06em" }}>{parse(d.date).getDate()}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <Card style={{ padding: T.space[3] }}>
        <p style={kicker}>{shortDate(selDay)}</p>
        {picked ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: T.space[3], flexWrap: "wrap", marginTop: T.space[2] }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: T.color.text, fontWeight: 600 }}>{picked.workout_title}</div>
              {picked.program_title && <div style={muted}>{picked.program_title}</div>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
              <Chip tone={picked.status === "completed" ? "good" : picked.status === "skipped" ? "default" : "energy"}>{picked.status === "assigned" ? "Scheduled" : picked.status}</Chip>
              {picked.status === "assigned" && <Button variant="ghost" onClick={() => setStatus(picked, "skipped")}>Skip</Button>}
              {picked.status === "skipped" && <Button variant="ghost" onClick={() => setStatus(picked, "assigned")}>Unskip</Button>}
            </div>
          </div>
        ) : (
          <p style={{ ...muted, margin: `${T.space[2]}px 0 0`, fontSize: T.type.body }}>No session this day.</p>
        )}
      </Card>
      <div style={{ display: "flex", gap: T.space[2], flexWrap: "wrap" }}>
        <Button onClick={() => setSheet("assign")}>Assign a session</Button>
        <Button variant="quiet" onClick={() => setSheet("enrol")}>Enrol in a program</Button>
      </div>

      <h2 style={h2}>Readiness</h2>
      <Card style={{ display: "flex", gap: T.space[4], alignItems: "center", padding: T.space[3] }}>
        <Ring score={Number.isFinite(todayScore) ? todayScore : null} label="Today" size={96} />
        <div style={{ flex: 1, minWidth: 0 }}><Trend points={points} /></div>
      </Card>

      <h2 style={h2}>Next sessions</h2>
      <Card style={{ padding: T.space[3], display: "grid", gap: T.space[2] }}>
        {upcoming.length === 0 && <p style={{ ...muted, margin: 0 }}>Nothing scheduled.</p>}
        {upcoming.map((a) => (
          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", gap: T.space[3], alignItems: "baseline" }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ color: T.color.text, fontWeight: 600 }}>{a.workout.title}</span>
              {programOf.get(a.id) && <span style={{ ...muted, display: "block" }}>{programOf.get(a.id)}</span>}
            </span>
            <span style={{ ...muted, flexShrink: 0 }}>{shortDate(a.scheduled_for)}{a.status === "skipped" ? " · skipped" : ""}</span>
          </div>
        ))}
      </Card>

      <h2 style={h2}>Recent sessions</h2>
      <Card style={{ padding: T.space[3], display: "grid", gap: T.space[2] }}>
        {recent.length === 0 && <p style={{ ...muted, margin: 0 }}>No sessions logged yet.</p>}
        {recent.map((l) => (
          <div key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: T.space[3], alignItems: "baseline" }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ color: T.color.text, fontWeight: 600 }}>{titleOf.get(l.assignment_id) || "Freeform workout"}</span>
              <span style={{ ...muted, display: "block" }}>{l.sets.length} set{l.sets.length === 1 ? "" : "s"}{l.feel ? ` · ${l.feel}` : ""}</span>
            </span>
            <span style={{ ...muted, flexShrink: 0 }}>{shortDate(l.performed_at)}</span>
          </div>
        ))}
      </Card>

      <h2 style={h2}>Conversation</h2>
      <Thread clientId={id} onSignedOut={onSignedOut} onRead={onChanged} />
      <Switch on={autoSend} busy={switchBusy} onChange={changeAuto} label="Send Kyle's AI replies without review"
        hint={autoSend ? "Replies go straight to this client." : "Replies wait in Drafts for your approval."} />

      {sheet === "assign" && <AssignSheet clientId={id} today={today} onClose={() => setSheet(null)} onDone={done} onSignedOut={onSignedOut} />}
      {sheet === "enrol" && <EnrolSheet clientId={id} today={today} onClose={() => setSheet(null)} onDone={done} onSignedOut={onSignedOut} />}
      <Toast message={toast} tone="good" onDone={clearToast} />
    </section>
  );
}

function BackLink({ onBack }) {
  return (
    <button type="button" className="wh-btn" onClick={onBack}
      style={{ display: "inline-flex", alignItems: "center", gap: T.space[1], minHeight: 44, padding: 0, background: "none", border: "none", color: T.color.muted, cursor: "pointer", font: "inherit", justifySelf: "start" }}>
      <ChevronLeft size={18} /> Roster
    </button>
  );
}
