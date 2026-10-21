import React, { useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { T } from "../theme.js";
import { Bar, Button } from "../ui/index.js";
import { CHECKIN_QS } from "../data/checkin.js";
import { post } from "./net.js";

const ghostBtn = {
  display: "inline-flex", alignItems: "center", gap: T.space[1], minHeight: 44, padding: `0 ${T.space[2]}px`, background: "none",
  border: "none", color: T.color.muted, cursor: "pointer", fontFamily: T.font.display, fontWeight: 700, fontSize: 14,
  letterSpacing: ".08em", textTransform: "uppercase", borderRadius: T.radius.control,
};

// SEVEN QUESTIONS, ONE PER SCREEN. THE ANSWER INDEX IS ITS POINT VALUE, SO THE SCORE IS round(sum / 21 * 100), AS IN THE LEGACY SURVEY.
export function Checkin({ day, onDone, onSkip, onSignedOut }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef(null);
  const q = CHECKIN_QS[step];

  const submit = async (final) => {
    setBusy(true); setError("");
    const sum = Object.values(final).reduce((s, v) => s + v, 0);
    const score = Math.round((sum / 21) * 100);
    const res = await post("/api/checkins", { day, score, answers: final }, onSignedOut);
    setBusy(false);
    if (!res.ok) { setError("Couldn't save your check-in. Tap your answer again to retry."); return; }
    onDone(res.data);
  };

  const pick = (i) => {
    if (busy) return;
    const next = { ...answers, [q.key]: i };
    setAnswers(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (step < CHECKIN_QS.length - 1) setStep(step + 1);
      else submit(next);
    }, 180);
  };

  return (
    <main style={{ minHeight: "100dvh", background: T.color.bg, color: T.color.body, fontFamily: T.font.body }}>
      <div style={{ maxWidth: 430, margin: "0 auto", padding: `${T.space[4]}px ${T.space[4]}px ${T.space[6]}px`, minHeight: "100dvh", display: "flex", flexDirection: "column", gap: T.space[4] }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {step > 0
            ? <button type="button" className="wh-btn" onClick={() => setStep(step - 1)} style={ghostBtn}><ChevronLeft size={16} /> Back</button>
            : <span style={{ fontFamily: T.font.display, fontWeight: 700, fontSize: T.type.label, letterSpacing: ".1em", textTransform: "uppercase", color: T.color.muted }}>Morning check-in</span>}
          <button type="button" className="wh-btn" onClick={onSkip} style={ghostBtn}>Skip</button>
        </div>
        <Bar value={step / CHECKIN_QS.length} label="Check-in progress" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: T.space[5] }}>
          <div>
            <p style={{ margin: 0, fontFamily: T.font.display, fontWeight: 700, fontSize: T.type.label, letterSpacing: ".1em", textTransform: "uppercase", color: T.color.muted }}>
              Question {step + 1} of {CHECKIN_QS.length}
            </p>
            <h1 style={{ margin: `${T.space[2]}px 0 0`, fontFamily: T.font.display, fontWeight: 800, fontSize: T.type.display, lineHeight: 1, letterSpacing: ".02em", textTransform: "uppercase", color: T.color.text, textWrap: "balance" }}>{q.q}</h1>
          </div>
          <div role="group" aria-label={q.q} style={{ display: "grid", gap: T.space[2] }}>
            {q.opts.map((word, i) => {
              const on = answers[q.key] === i;
              return (
                <button key={word} type="button" className="wh-btn" aria-pressed={on} disabled={busy} onClick={() => pick(i)}
                  style={{ textAlign: "left", minHeight: 56, padding: `${T.space[3]}px ${T.space[4]}px`, borderRadius: T.radius.card, cursor: "pointer",
                    fontFamily: T.font.body, fontWeight: 600, fontSize: 16, color: on ? T.color.text : T.color.body,
                    background: on ? T.color.energyWash : T.color.surface, border: `1px solid ${on ? T.color.energy : T.color.line}` }}>
                  {word}
                </button>
              );
            })}
          </div>
          {error && <p role="alert" style={{ margin: 0, color: T.color.warn, fontSize: T.type.small }}>{error}</p>}
          {busy && <Button variant="quiet" busy full>Saving…</Button>}
        </div>
      </div>
    </main>
  );
}
