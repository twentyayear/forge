import React, { useEffect, useMemo, useState } from "react";
import { Check, Play } from "lucide-react";
import { T } from "../theme.js";
import { Button, Card, Chip, Header, KyleLine, Ring } from "../ui/index.js";
import { fmtLong } from "../data/dates.js";
import {
  assignmentForDay, dayOf, estMinutes, hitsForLog, nextAssignment, sessionFromAssignment, todayStr, weekStrip,
} from "./engine.js";
import { call } from "./net.js";

const kicker = { margin: 0, fontFamily: T.font.display, fontWeight: 700, fontSize: T.type.label, letterSpacing: ".1em", textTransform: "uppercase", color: T.color.muted };
const bigline = { margin: `${T.space[1]}px 0 0`, fontFamily: T.font.display, fontWeight: 700, fontSize: 24, lineHeight: 1.05, color: T.color.text };

const CELL = {
  done: { background: T.color.energyDeep, color: T.color.onDeep },
  today: { background: T.color.surface2, color: T.color.text, boxShadow: `inset 0 0 0 2px ${T.color.energy}` },
  missed: { background: T.color.warnBg, color: T.color.warn },
  assigned: { background: T.color.surface2, color: T.color.body },
  rest: { background: T.color.surface2, color: T.color.muted },
};
const CELL_WORD = { done: "done", today: "today", missed: "missed", assigned: "planned", rest: "rest" };

function greeting(hour) {
  return hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
}

export function Today({ data, session, speaker, onSelect, onCheckin, onTrainAgain, onSignedOut }) {
  const day = todayStr();
  const now = new Date();
  const first = (data.user?.name || session?.name || "").trim().split(/\s+/)[0];
  const todays = data.checkins.find((c) => dayOf(c.day) === day);
  const score = todays ? todays.score : null;
  const assignment = assignmentForDay(data.assignments, day);
  const next = nextAssignment(data.assignments, day);
  const plan = useMemo(() => (assignment ? sessionFromAssignment(assignment) : null), [assignment]);
  const strip = useMemo(() => weekStrip(data.assignments, day), [data.assignments, day]);
  const logs = data.workoutLogs || [];
  const lastLog = useMemo(() => [...logs].sort((a, b) => Date.parse(b.performed_at) - Date.parse(a.performed_at))[0], [logs]);
  const lastHits = lastLog ? hitsForLog(lastLog, data.assignments) : null;
  const streak = data.streaks?.session;

  const [kyle, setKyle] = useState(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const res = await call("/api/messages", undefined, onSignedOut);
      if (!live || !res.ok || !Array.isArray(res.data)) return;
      const last = [...res.data].reverse().find((m) => m.sender === "kyle");
      if (last) setKyle(last);
    })();
    return () => { live = false; };
  }, [onSignedOut]);

  const sets = plan ? plan.exercises.reduce((s, e) => s + e.rows.length, 0) : 0;
  const completed = assignment?.status === "completed";
  const weekAssigned = strip.filter((d) => d.assigned).length;
  const weekDone = strip.filter((d) => d.done).length;

  return (
    <>
      <Header kicker={fmtLong(now)} title={`${greeting(now.getHours())}${first ? `, ${first}` : ""}`}
        right={<Ring score={score} label="Ready" size={88} />} />
      {score == null && (
        <Button variant="quiet" onClick={onCheckin} style={{ alignSelf: "flex-start" }}>Check in</Button>
      )}

      {assignment ? (
        <Card accent style={{ padding: T.space[4] }}>
          <p style={kicker}>Today from Kyle</p>
          <p style={bigline}>{plan.title}</p>
          <p style={{ margin: `${T.space[1]}px 0 0`, color: T.color.muted, fontSize: T.type.small }}>
            {plan.exercises.length} exercise{plan.exercises.length === 1 ? "" : "s"} · {sets} sets · ~{estMinutes(plan.exercises)} min
            {plan.programTitle ? ` · ${plan.programTitle}` : ""}
          </p>
          <div style={{ display: "flex", gap: T.space[2], flexWrap: "wrap", marginTop: T.space[3] }}>
            {Number.isFinite(streak) && <Chip tone={streak >= 3 ? "good" : "default"}>Streak {streak}</Chip>}
            {lastHits && <Chip>Last: {lastHits.hit} of {lastHits.total} targets hit</Chip>}
          </div>
          <div style={{ display: "grid", gap: T.space[2], marginTop: T.space[4] }}>
            {completed ? (
              <>
                <Chip tone="good" style={{ justifySelf: "start" }}>Completed</Chip>
                <Button variant="quiet" onClick={onTrainAgain}>Train again</Button>
              </>
            ) : (
              <Button full onClick={() => onSelect("train")}>Start session</Button>
            )}
          </div>
        </Card>
      ) : (
        <Card style={{ padding: T.space[4] }}>
          <p style={kicker}>No session today</p>
          <p style={{ margin: `${T.space[2]}px 0 0`, color: T.color.body, fontSize: T.type.body }}>
            {next
              ? `Next up: ${next.workout?.title || "your session"} on ${fmtLong(new Date(`${dayOf(next.scheduled_for)}T00:00:00`))}.`
              : "Nothing is scheduled yet. Kyle will assign your next session here."}
          </p>
        </Card>
      )}

      {kyle && (
        <Card style={{ padding: T.space[3] }}>
          <KyleLine text={kyle.body} talking={speaker.talking && speaker.line === kyle.body}
            meta={`Kyle · ${new Date(kyle.created_at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}`} />
          <button type="button" className="wh-btn" onClick={() => speaker.speak(kyle.body)} aria-label="Play Kyle's message"
            style={{ display: "inline-flex", alignItems: "center", gap: T.space[2], minHeight: 44, marginTop: T.space[2], marginLeft: 34 + T.space[3], padding: `0 ${T.space[4]}px`,
              background: T.color.surface2, color: T.color.text, border: "none", borderRadius: T.radius.control, cursor: "pointer",
              fontFamily: T.font.display, fontWeight: 700, fontSize: 14, letterSpacing: ".08em", textTransform: "uppercase" }}>
            <Play size={16} /> Play
          </button>
        </Card>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: T.space[1] }}>
        <h2 style={{ ...kicker, fontSize: T.type.label }}>This week</h2>
        {weekAssigned > 0 && <span style={{ color: T.color.muted, fontSize: T.type.label }}>{weekDone} of {weekAssigned} done</span>}
      </div>
      <ol aria-label="This week" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: T.space[1] }}>
        {strip.map((d) => (
          <li key={d.date} aria-label={`${new Date(`${d.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" })}: ${d.state === "today" && d.done ? "today, done" : CELL_WORD[d.state]}`}
            style={{ ...CELL[d.state], borderRadius: T.radius.chip, minHeight: 52, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
            <b style={{ fontFamily: T.font.display, fontWeight: 800, fontSize: 16, lineHeight: 1 }}>{d.label}</b>
            <span aria-hidden="true" style={{ height: 14, display: "grid", placeItems: "center", fontSize: 10, fontFamily: T.font.display, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" }}>
              {d.state === "done" || d.done ? <Check size={12} strokeWidth={3} /> : d.state === "today" ? "now" : d.state === "assigned" ? "·" : ""}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}
