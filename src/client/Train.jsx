import React, { useCallback, useEffect, useMemo, useState } from "react";
import { T } from "../theme.js";
import { Bar, Button, Card, Chip, Header, SetGrid, Sheet } from "../ui/index.js";
import { fmtLong } from "../data/dates.js";
import {
  assignmentForDay, dayOf, lastSessionFor, mmss, nextAssignment, sessionFromAssignment, sessionKey, sessionTotals, targetsHit, todayStr, volume,
} from "./engine.js";
import { post } from "./net.js";
import { KyleMoment } from "./KyleMoment.jsx";
import { Finish } from "./Finish.jsx";

const muted = { color: T.color.muted, fontSize: T.type.small };

// ONLY THE ROWS AND THE POSITION GO TO sessionStorage; NAMES, REST AND INFO ARE REBUILT FROM THE ASSIGNMENT SO A STALE COPY NEVER OUTLIVES A CHANGED PLAN.
function readSaved(id) {
  try { return JSON.parse(sessionStorage.getItem(sessionKey(id)) || "null"); } catch { return null; }
}
function initial(assignment) {
  const plan = sessionFromAssignment(assignment);
  const saved = readSaved(assignment.id);
  if (saved && Array.isArray(saved.rows) && saved.rows.length === plan.exercises.length
      && saved.rows.every((r, i) => Array.isArray(r) && r.length >= plan.exercises[i].rows.length)) {
    plan.exercises.forEach((e, i) => { e.rows = saved.rows[i]; });
    return { plan, idx: Math.min(saved.idx || 0, plan.exercises.length - 1), startedAt: saved.startedAt || Date.now() };
  }
  return { plan, idx: 0, startedAt: Date.now() };
}

function targetLabel(rows) {
  const t = rows.filter((r) => r.target_reps != null || r.target_weight_lbs != null);
  if (!t.length) return null;
  const span = (vals) => {
    const v = vals.filter((x) => x != null);
    if (!v.length) return null;
    const lo = Math.min(...v), hi = Math.max(...v);
    return lo === hi ? `${lo}` : `${lo}–${hi}`;
  };
  const reps = span(t.map((r) => r.target_reps));
  const w = span(t.map((r) => r.target_weight_lbs));
  return `Target ${t.length} × ${reps ?? "?"}${w ? ` @ ${w}` : ""}`;
}

function NoSession({ data, completed, onAgain, onToday }) {
  const day = todayStr();
  const next = nextAssignment(data.assignments, day);
  return (
    <>
      <Header kicker={fmtLong(new Date())} title="Train" />
      <Card style={{ padding: T.space[4] }}>
        <p style={{ margin: 0, fontFamily: T.font.display, fontWeight: 700, fontSize: T.type.label, letterSpacing: ".1em", textTransform: "uppercase", color: T.color.muted }}>
          {completed ? "Session complete" : "No session today"}
        </p>
        <p style={{ margin: `${T.space[2]}px 0 0`, color: T.color.body }}>
          {completed
            ? "Today's session is logged."
            : next
              ? `Next up: ${next.workout?.title || "your session"} on ${fmtLong(new Date(`${dayOf(next.scheduled_for)}T00:00:00`))}.`
              : "Nothing is scheduled yet. Kyle will assign your next session here."}
        </p>
        {completed && (
          <div style={{ display: "flex", gap: T.space[2], marginTop: T.space[3], flexWrap: "wrap" }}>
            <Button variant="quiet" onClick={onAgain}>Train again</Button>
            <Button variant="ghost" onClick={onToday}>Back to Today</Button>
          </div>
        )}
      </Card>
    </>
  );
}

export function Train({ data, session: user, speaker, again, reload, onSignedOut, onFinished, onLeave }) {
  const day = todayStr();
  const assignment = assignmentForDay(data.assignments, day);
  const open = assignment && (assignment.status !== "completed" || again);
  const first = (data.user?.name || user?.name || "").trim().split(/\s+/)[0];

  const [run, setRun] = useState(() => (open ? initial(assignment) : null));
  const [phase, setPhase] = useState("train"); // train | moment | finish
  const [moment, setMoment] = useState(null); // {text, failed, hit, volume, setsDone}
  const [restEnd, setRestEnd] = useState(null);
  const [tick, setTick] = useState(Date.now());
  const [video, setVideo] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const exercises = run?.plan.exercises;
  const idx = run?.idx ?? 0;
  const ex = exercises?.[idx];

  // MIRROR THE IN-PROGRESS SESSION AFTER EVERY CHANGE; THE FINISH SCREEN CLEARS IT ONCE THE LOG IS SAVED.
  useEffect(() => {
    if (!run || phase === "finish") return;
    try {
      sessionStorage.setItem(sessionKey(run.plan.assignmentId), JSON.stringify({ idx: run.idx, startedAt: run.startedAt, rows: run.plan.exercises.map((e) => e.rows) }));
    } catch { /* storage unavailable: the session still runs in memory */ }
  }, [run, phase]);

  useEffect(() => {
    if (restEnd === null) return undefined;
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [restEnd]);
  const restLeft = restEnd === null ? 0 : Math.max(0, Math.ceil((restEnd - tick) / 1000));
  useEffect(() => { if (restEnd !== null && restLeft === 0) setRestEnd(null); }, [restEnd, restLeft]);

  const last = useMemo(() => (ex ? lastSessionFor(ex.key, data.workoutLogs) : null), [ex, data.workoutLogs]);

  const patchRows = useCallback((fn) => {
    setRun((r) => ({ ...r, plan: { ...r.plan, exercises: r.plan.exercises.map((e, i) => (i === r.idx ? { ...e, rows: fn(e.rows) } : e)) } }));
  }, []);

  if (!run) {
    return <NoSession data={data} completed={assignment?.status === "completed"}
      onAgain={() => { onLeave("again"); }} onToday={() => onLeave("today")} />;
  }

  if (phase === "finish") {
    return <Finish plan={run.plan} startedAt={run.startedAt} assignmentId={run.plan.assignmentId} firstName={first} logs={data.workoutLogs}
      speaker={speaker} reload={reload} onSignedOut={onSignedOut} onDone={onFinished} />;
  }

  const bodyweight = ex.rows.every((r) => r.weight_lbs == null && r.target_weight_lbs == null);
  const doneRows = ex.rows.filter((r) => r.done);
  const lastExercise = idx === exercises.length - 1;
  const totals = sessionTotals(exercises);

  const toggle = (k) => {
    const wasDone = ex.rows[k].done;
    patchRows((rows) => rows.map((r, i) => (i === k ? { ...r, done: !r.done } : r)));
    if (!wasDone) { setTick(Date.now()); setRestEnd(Date.now() + ex.restSec * 1000); } else setRestEnd(null);
  };

  const doneWithExercise = async () => {
    speaker.stop();
    setRestEnd(null);
    const rows = ex.rows.filter((r) => r.done);
    setMoment({ text: null, failed: false, hit: targetsHit(rows), volume: volume(rows), setsDone: rows.length });
    setPhase("moment");
    const res = await post("/api/coach/line", {
      assignment_id: run.plan.assignmentId, exercise_key: ex.key, kind: "exercise",
      sets: rows.map(({ set_no, reps, weight_lbs, target_reps, target_weight_lbs }) => ({ set_no, reps, weight_lbs, target_reps, target_weight_lbs })),
    }, onSignedOut);
    if (res.ok && res.data?.text) {
      setMoment((m) => ({ ...m, text: res.data.text }));
      speaker.speak(res.data.text);
    } else {
      setMoment((m) => ({ ...m, failed: true }));
    }
  };

  const advance = () => {
    speaker.stop();
    if (lastExercise) { setPhase("finish"); return; }
    setRun((r) => ({ ...r, idx: r.idx + 1 }));
    setMoment(null);
    setPhase("train");
  };

  const leaveEmpty = () => {
    try { sessionStorage.removeItem(sessionKey(run.plan.assignmentId)); } catch { /* nothing to clear */ }
    onLeave("today");
  };

  if (phase === "moment" && moment) {
    return (
      <KyleMoment text={moment.text} failed={moment.failed} talking={speaker.talking} hit={moment.hit} volume={moment.volume}
        lastVolume={last?.volume ?? 0} setsDone={moment.setsDone}
        nextName={lastExercise ? null : exercises[idx + 1].name} onNext={advance} onReplay={() => moment.text && speaker.speak(moment.text)} />
    );
  }

  const progress = (idx + doneRows.length / Math.max(1, ex.rows.length)) / exercises.length;
  const target = targetLabel(ex.rows);

  return (
    <>
      <Bar value={progress} label={`${run.plan.title} progress`} />
      <Header kicker={`Exercise ${idx + 1} of ${exercises.length}`} title={ex.name} />
      <div style={{ display: "flex", gap: T.space[2], flexWrap: "wrap" }}>
        {target && <Chip>{target}</Chip>}
        {last && <Chip tone="energy">{last.topWeight > 0 ? `Last ${last.topWeight} × ${last.topReps}` : `Last ${last.topReps} reps`}</Chip>}
      </div>
      {ex.note && <p style={{ ...muted, margin: 0 }}>{ex.note}</p>}

      <Card style={{ padding: T.space[3] }}>
        <SetGrid rows={ex.rows} bodyweight={bodyweight}
          onChange={(k, patch) => patchRows((rows) => rows.map((r, i) => (i === k ? { ...r, ...patch } : r)))}
          onToggle={toggle}
          onAdd={() => patchRows((rows) => {
            const l = rows[rows.length - 1];
            return [...rows, { set_no: rows.length + 1, reps: l.reps, weight_lbs: l.weight_lbs, target_reps: null, target_weight_lbs: null, done: false }];
          })} />
        <p aria-live="off" style={{ ...muted, margin: `${T.space[3]}px 0 0`, minHeight: 20, fontVariantNumeric: "tabular-nums" }}>
          {restEnd !== null ? `Rest ${mmss(ex.restSec)} → ${mmss(restLeft)}` : `Rest ${mmss(ex.restSec)} between sets`}
        </p>
      </Card>

      {ex.info?.video && <Button variant="quiet" full onClick={() => setVideo(true)}>Watch the form video</Button>}
      <Button full disabled={doneRows.length === 0} onClick={doneWithExercise}>Done with {ex.name}</Button>
      <p style={{ ...muted, textAlign: "center", margin: 0 }}>
        {doneRows.length === 0 ? "Log a set to finish this exercise." : "Kyle speaks after this exercise, not after every set."}
      </p>

      {!confirmEnd ? (
        <Button variant="ghost" full onClick={() => setConfirmEnd(true)}>End session early</Button>
      ) : (
        <Card style={{ padding: T.space[3] }}>
          <p style={{ margin: 0, color: T.color.text }}>
            {totals.setsDone > 0 ? `End now and save the ${totals.setsDone} set${totals.setsDone === 1 ? "" : "s"} you logged?` : "Nothing is logged yet. Leave this session?"}
          </p>
          <div style={{ display: "flex", gap: T.space[2], marginTop: T.space[3], flexWrap: "wrap" }}>
            <Button onClick={() => { speaker.stop(); setRestEnd(null); if (totals.setsDone > 0) setPhase("finish"); else leaveEmpty(); }}>
              {totals.setsDone > 0 ? "Save and finish" : "Leave"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmEnd(false)}>Keep going</Button>
          </div>
        </Card>
      )}

      {video && (
        <Sheet title={ex.name} onClose={() => setVideo(false)}>
          <div style={{ marginTop: T.space[4], position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: T.radius.card, overflow: "hidden", background: T.color.bg }}>
            <iframe title={`${ex.name} form video`} src={`https://www.youtube-nocookie.com/embed/${ex.info.video}`}
              allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} />
          </div>
          {ex.info.cues?.length > 0 && (
            <ul style={{ margin: `${T.space[4]}px 0 0`, paddingLeft: T.space[5], color: T.color.body, lineHeight: 1.5 }}>
              {ex.info.cues.map((c) => <li key={c}>{c}</li>)}
            </ul>
          )}
        </Sheet>
      )}
    </>
  );
}
