import React, { useEffect, useRef, useState } from "react";
import { T } from "../theme.js";
import { Button, Card, Celebration, Chip, Header, KyleLine, Numeral } from "../ui/index.js";
import { fmtVolume, percentVs, previousLogVolume, sessionKey, sessionTotals } from "./engine.js";
import { call, post } from "./net.js";

const FEELS = [["easy", "Easy"], ["right", "Right"], ["hard", "Hard"]];
const label = { margin: `${T.space[2]}px 0 0`, fontFamily: T.font.display, fontWeight: 600, fontSize: T.type.label, letterSpacing: ".1em", textTransform: "uppercase", color: T.color.muted };

// THE BLURB NAMES THE LIFT OR PROGRAM FROM THE ACHIEVEMENT'S OWN CONTEXT; A MISSING VALUE FALLS BACK TO PLAIN WORDS.
function fillBlurb(blurb, context) {
  return (blurb || "")
    .replace(/<exercise>/g, context?.exercise || "that lift")
    .replace(/<program>/g, context?.program || "your program");
}

export function Finish({ plan, assignmentId, firstName, logs, speaker, reload, onSignedOut, onDone }) {
  const totals = sessionTotals(plan.exercises);
  // THE PREVIOUS LOG IS READ ONCE, BEFORE THIS ONE EXISTS IN THE BOOTSTRAP.
  const [prevVolume] = useState(() => previousLogVolume(logs));
  const [saved, setSaved] = useState(null); // {id, earned}
  const [error, setError] = useState("");
  const [line, setLine] = useState(null); // {text} | {failed}
  const [feel, setFeel] = useState(null);
  const [feelError, setFeelError] = useState("");
  const [shown, setShown] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const inFlight = useRef(false);

  const save = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setError("");
    const sets = plan.exercises.flatMap((e) => e.rows.filter((r) => r.done).map((r) => ({
      exercise_key: e.key, set_no: r.set_no, reps: r.reps, weight_lbs: r.weight_lbs, rpe: null,
    })));
    const res = await post("/api/workout-logs", { performed_at: new Date().toISOString(), assignment_id: assignmentId, notes: null, feel: null, sets }, onSignedOut);
    if (!res.ok || !res.data?.id) {
      inFlight.current = false;
      setError("Couldn't save your session. Your sets are still on this phone.");
      return;
    }
    try { sessionStorage.removeItem(sessionKey(assignmentId)); } catch { /* nothing to clear */ }
    setSaved({ id: res.data.id, earned: Array.isArray(res.data.earned) ? res.data.earned : [] });
    reload();
    const lineRes = await post("/api/coach/line", { assignment_id: assignmentId, exercise_key: "", kind: "finish", sets: [] }, onSignedOut);
    if (lineRes.ok && lineRes.data?.text) {
      setLine({ text: lineRes.data.text });
      speaker.speak(lineRes.data.text);
    } else {
      setLine({ failed: true });
    }
  };

  // THE REF GUARD KEEPS A STRICT-MODE DOUBLE EFFECT FROM POSTING THE SAME LOG TWICE.
  useEffect(() => { save(); }, []); // eslint-disable-line

  const pickFeel = async (f) => {
    setFeelError("");
    const res = await call(`/api/workout-logs/${saved.id}`, { method: "PATCH", body: JSON.stringify({ feel: f }) }, onSignedOut);
    if (res.ok) setFeel(f); else setFeelError("Couldn't save that. Tap again to retry.");
  };

  const done = async () => { setLeaving(true); await reload(); onDone(); };

  const vol = fmtVolume(totals.volume);
  const delta = prevVolume ? percentVs(totals.volume, prevVolume) : null;
  const earned = saved?.earned || [];
  const ach = earned[Math.min(shown, earned.length - 1)];

  return (
    <>
      <Header kicker={plan.title} title={`Good work${firstName ? `, ${firstName}` : ""}`} />

      {error && (
        <Card style={{ padding: T.space[4], borderColor: T.color.warn }}>
          <p role="alert" style={{ margin: 0, color: T.color.text }}>{error}</p>
          <Button style={{ marginTop: T.space[3] }} onClick={save}>Try again</Button>
        </Card>
      )}

      {ach && (
        <div>
          <Celebration key={ach.id || shown} n={shown + 1} title={ach.title} blurb={fillBlurb(ach.blurb, ach.context)} />
          {shown < earned.length - 1 && (
            <Button variant="quiet" full style={{ marginTop: T.space[2] }} onClick={() => setShown(shown + 1)}>Next ({shown + 1} of {earned.length})</Button>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: T.space[2] }}>
        <Card style={{ padding: T.space[4] }}>
          <Numeral value={totals.targetsTotal ? totals.targetsHit : totals.setsDone} unit={totals.targetsTotal ? `of ${totals.targetsTotal}` : "sets"} />
          <p style={label}>{totals.targetsTotal ? "Targets hit" : "Sets done"}</p>
        </Card>
        <Card style={{ padding: T.space[4] }}>
          <Numeral value={totals.volume > 0 ? vol.value : "–"} unit={totals.volume > 0 ? vol.unit : undefined} />
          <p style={label}>Volume</p>
          {delta !== null && totals.volume > 0 && (
            <Chip tone={delta > 0 ? "good" : "default"} style={{ marginTop: T.space[2] }}>{delta === 0 ? "= last time" : delta > 0 ? `+${delta}%` : `−${Math.abs(delta)}%`}</Chip>
          )}
        </Card>
      </div>

      {saved && (
        <Card style={{ padding: T.space[3] }}>
          <KyleLine talking={speaker.talking}
            text={line?.text ?? (line?.failed ? "Kyle's note didn't load. Your session is saved." : "Kyle is writing your finish line…")}
            onReplay={line?.text ? () => speaker.speak(line.text) : undefined} />
        </Card>
      )}

      {saved && (
        <div>
          <p style={{ ...label, margin: 0 }}>How did it feel?</p>
          <div role="group" aria-label="How did it feel" style={{ display: "flex", gap: T.space[2], marginTop: T.space[2] }}>
            {FEELS.map(([id, text]) => (
              <Chip key={id} tone={feel === id ? "energy" : "default"} onClick={() => pickFeel(id)} aria-pressed={feel === id}>{text}</Chip>
            ))}
          </div>
          {feelError && <p role="alert" style={{ margin: `${T.space[2]}px 0 0`, color: T.color.warn, fontSize: T.type.small }}>{feelError}</p>}
        </div>
      )}

      {saved && <Button full busy={leaving} onClick={done}>Done</Button>}
    </>
  );
}
