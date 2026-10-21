import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Play } from "lucide-react";
import { T } from "../theme.js";
import { Avatar, Button, Card, Chip, Header, Sheet, Toast, Waveform } from "../ui/index.js";
import { fmtLong } from "../data/dates.js";
import { fmtVolume } from "./engine.js";
import { call, post } from "./net.js";
import { groupByDay, logVolume, priceLabel, setsByExercise, timeLabel } from "./coach.js";
import { bigline, cardButton, kicker, muted } from "./styles.js";

const SEGS = [["kyle", "Kyle"], ["history", "History"], ["offers", "Offers"]];
const SEG_KEY = "workhart.coachSeg";
const MAX_LEN = 2000;
const LINE = 22;
const MAX_LINES = 4;

function readSeg() {
  try { const v = sessionStorage.getItem(SEG_KEY); return SEGS.some(([id]) => id === v) ? v : "kyle"; } catch { return "kyle"; }
}

// ONE GET PER OPEN: STATE IS {items, loading, error} AND reload() REFETCHES WITHOUT CLEARING WHAT IS ON SCREEN.
function useList(path, active, onSignedOut, pick) {
  const [state, setState] = useState({ items: null, loading: false, error: false });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: s.items === null, error: false }));
    const res = await call(path, undefined, onSignedOut);
    const items = res.ok ? pick(res.data) : null;
    if (items) setState({ items, loading: false, error: false });
    else setState((s) => ({ ...s, loading: false, error: true }));
    return items;
  }, [path, onSignedOut, pick]);
  useEffect(() => { if (active) load(); }, [active, load]);
  return { ...state, reload: load };
}

const pickArray = (d) => (Array.isArray(d) ? d : null);
const pickLogs = (d) => (d && Array.isArray(d.logs) ? d.logs : null);

function Status({ list, empty }) {
  if (list.items === null && list.loading) return <p role="status" style={muted}>Loading</p>;
  if (list.items === null && list.error) {
    return (
      <div style={{ display: "grid", gap: T.space[2], justifyItems: "start" }}>
        <p role="alert" style={{ ...muted, color: T.color.warn }}>Couldn't load this. Check your connection.</p>
        <Button variant="quiet" onClick={list.reload}>Try again</Button>
      </div>
    );
  }
  if (list.items && list.items.length === 0) return <p style={{ ...muted, fontSize: T.type.body }}>{empty}</p>;
  return null;
}

function KyleBubble({ m, speaker }) {
  const mine = speaker.line === m.body;
  return (
    <div style={{ display: "flex", gap: T.space[2], alignItems: "flex-start", maxWidth: "92%" }}>
      <Avatar />
      <div style={{ minWidth: 0 }}>
        <div style={{ background: T.color.surface2, borderRadius: T.radius.card, padding: `${T.space[2]}px ${T.space[3]}px`, color: T.color.text, fontSize: T.type.body, lineHeight: 1.4, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
          {m.body}
          {mine && speaker.talking && <div style={{ marginTop: T.space[2] }}><Waveform on /></div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: T.space[2], flexWrap: "wrap" }}>
          <span style={{ color: T.color.muted, fontSize: T.type.label }}>Kyle · {timeLabel(m.created_at)}</span>
          <Button variant="ghost" onClick={() => speaker.speak(m.body)} aria-label="Play Kyle's message" style={{ minHeight: 44, padding: `0 ${T.space[3]}px`, fontSize: 12 }}>
            <Play size={14} /> Play
          </Button>
        </div>
        {mine && speaker.status === "fail" && !speaker.talking && (
          <p role="status" style={{ ...muted, fontSize: T.type.label, margin: 0 }}>Couldn't play the audio. The message is above.</p>
        )}
      </div>
    </div>
  );
}

function MyBubble({ m }) {
  return (
    <div style={{ marginLeft: "auto", maxWidth: "85%", textAlign: "right" }}>
      <div style={{ display: "inline-block", textAlign: "left", background: T.color.energyDeep, color: T.color.onDeep, borderRadius: T.radius.card, padding: `${T.space[2]}px ${T.space[3]}px`, fontSize: T.type.body, lineHeight: 1.4, overflowWrap: "anywhere", whiteSpace: "pre-wrap", opacity: m.pending ? 0.7 : 1 }}>
        {m.body}
      </div>
      <div style={{ color: T.color.muted, fontSize: T.type.label }}>{m.pending ? "Sending" : timeLabel(m.created_at)}</div>
    </div>
  );
}

function Composer({ draft, setDraft, onSend, busy }) {
  const ref = useRef(null);
  // AUTO-GROW TO FOUR LINES, THEN SCROLL INSIDE THE FIELD.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, LINE * MAX_LINES + T.space[3])}px`;
  }, [draft]);
  const text = draft.trim();
  const can = text.length >= 1 && text.length <= MAX_LEN && !busy;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (can) onSend(text); }}
      style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, boxSizing: "border-box", zIndex: 39,
        bottom: `calc(${T.space[8] * 2 - T.space[3]}px + env(safe-area-inset-bottom))`, background: T.color.bg, borderTop: `1px solid ${T.color.line}`,
        padding: `${T.space[2]}px ${T.space[4]}px`, display: "flex", gap: T.space[2], alignItems: "flex-end" }}>
      <textarea ref={ref} className="wh-field" rows={1} value={draft} maxLength={MAX_LEN} aria-label="Message Kyle" placeholder="Message Kyle"
        onChange={(e) => setDraft(e.target.value)}
        style={{ flex: 1, minWidth: 0, boxSizing: "border-box", minHeight: 48, resize: "none", padding: `${T.space[3]}px ${T.space[3]}px`, lineHeight: `${LINE}px`,
          background: T.color.surface2, border: `1px solid ${T.color.line}`, borderRadius: T.radius.control, color: T.color.text, fontFamily: T.font.body, fontSize: 16, outline: "none" }} />
      <Button type="submit" disabled={!can} style={{ minHeight: 48 }}>Send</Button>
    </form>
  );
}

function Thread({ list, speaker, onSend, draft, setDraft, sending }) {
  const endRef = useRef(null);
  const count = list.items ? list.items.length : 0;
  useEffect(() => { if (endRef.current && endRef.current.scrollIntoView) endRef.current.scrollIntoView({ block: "end" }); }, [count]);
  const groups = useMemo(() => groupByDay(list.items || []), [list.items]);
  return (
    <>
      <Status list={list} empty="No messages yet. Kyle will reach out after your first session." />
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label} style={{ display: "grid", gap: T.space[3] }}>
          <h2 style={{ ...kicker, textAlign: "center" }}>{g.label}</h2>
          {g.messages.map((m) => (m.sender === "kyle" ? <KyleBubble key={m.id} m={m} speaker={speaker} /> : <MyBubble key={m.id} m={m} />))}
        </section>
      ))}
      <div ref={endRef} style={{ height: T.space[8] * 2 }} aria-hidden="true" />
      <Composer draft={draft} setDraft={setDraft} onSend={onSend} busy={sending} />
    </>
  );
}

function HistoryList({ list }) {
  const [open, setOpen] = useState(null);
  return (
    <>
      <Status list={list} empty="Your sessions from the last 30 days will show here." />
      <div style={{ display: "grid", gap: T.space[2] }}>
        {(list.items || []).map((log) => {
          const v = fmtVolume(logVolume(log.sets));
          return (
            <button key={log.id} type="button" className="wh-btn" onClick={() => setOpen(log)} style={cardButton}>
              <span style={{ ...kicker, display: "block" }}>{fmtLong(new Date(log.performed_at))}</span>
              <span style={{ ...bigline, display: "block", textTransform: "none" }}>{log.workout_title || "Session"}</span>
              <span style={{ display: "flex", gap: T.space[2], flexWrap: "wrap", marginTop: T.space[2] }}>
                <Chip>{log.sets.length} sets</Chip>
                <Chip>{v.value} {v.unit}</Chip>
                {log.feel && <Chip tone={log.feel === "easy" ? "good" : log.feel === "hard" ? "warn" : "default"}>{log.feel}</Chip>}
              </span>
            </button>
          );
        })}
      </div>
      {open && (
        <Sheet title={open.workout_title || "Session"} onClose={() => setOpen(null)}>
          <p style={{ ...muted, margin: `${T.space[1]}px 0 0` }}>{fmtLong(new Date(open.performed_at))}</p>
          {open.notes && <p style={{ color: T.color.body, fontSize: T.type.body, margin: `${T.space[3]}px 0 0` }}>{open.notes}</p>}
          <div style={{ display: "grid", gap: T.space[4], marginTop: T.space[4] }}>
            {setsByExercise(open.sets).map((ex) => (
              <div key={ex.key}>
                <p style={{ ...kicker, color: T.color.text }}>{ex.key}</p>
                <ul style={{ listStyle: "none", margin: `${T.space[1]}px 0 0`, padding: 0 }}>
                  {ex.rows.map((r) => (
                    <li key={r.set_no} style={{ display: "flex", justifyContent: "space-between", padding: `${T.space[2]}px 0`, borderTop: `1px solid ${T.color.line}`, color: T.color.body, fontVariantNumeric: "tabular-nums" }}>
                      <span>{r.set_no} × {r.reps} @ {r.weight_lbs == null ? "BW" : `${Number(r.weight_lbs)} lb`}</span>
                      {r.rpe != null && <span style={{ color: T.color.muted }}>RPE {r.rpe}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}

function OfferCards({ list, onAsk, busyId }) {
  return (
    <>
      <Status list={list} empty="Nothing on offer right now." />
      <div style={{ display: "grid", gap: T.space[3] }}>
        {(list.items || []).map((o) => (
          <Card key={o.id} accent style={{ padding: T.space[4] }}>
            <p style={kicker}>From Kyle</p>
            <p style={bigline}>{o.title}</p>
            {o.blurb && <p style={{ ...muted, margin: `${T.space[2]}px 0 0`, fontSize: T.type.body }}>{o.blurb}</p>}
            <div style={{ display: "flex", alignItems: "center", gap: T.space[2], marginTop: T.space[3] }}>
              {priceLabel(o.price_cents) && <span style={{ fontFamily: T.font.display, fontWeight: 800, fontSize: 24, color: T.color.text, fontVariantNumeric: "tabular-nums" }}>{priceLabel(o.price_cents)}</span>}
              {o.kind && <Chip>{o.kind}</Chip>}
            </div>
            <Button variant="quiet" full busy={busyId === o.id} onClick={() => onAsk(o)} style={{ marginTop: T.space[3] }}>Ask Kyle about this</Button>
          </Card>
        ))}
      </div>
    </>
  );
}

export function Coach({ data, speaker, reload, onSignedOut }) {
  const [seg, setSegState] = useState(readSeg);
  const setSeg = (id) => { setSegState(id); try { sessionStorage.setItem(SEG_KEY, id); } catch { /* storage unavailable */ } };
  const [toast, setToast] = useState("");
  const clearToast = useCallback(() => setToast(""), []);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const thread = useList("/api/messages", seg === "kyle", onSignedOut, pickArray);
  const history = useList("/api/history?days=30", seg === "history", onSignedOut, pickLogs);
  const offers = useList("/api/offers", seg === "offers", onSignedOut, pickArray);

  // MARK KYLE'S MESSAGES READ ONCE PER OPEN OF THE THREAD, THEN REFETCH BOOTSTRAP SO THE TAB BADGE CLEARS.
  const markedRef = useRef(false);
  useEffect(() => { if (seg !== "kyle") markedRef.current = false; }, [seg]);
  useEffect(() => {
    if (seg !== "kyle" || markedRef.current || !(data.unreadMessages > 0) || thread.items === null) return;
    markedRef.current = true;
    (async () => {
      const res = await post("/api/messages/read", {}, onSignedOut);
      if (res.ok) reload();
    })();
  }, [seg, data.unreadMessages, thread.items, onSignedOut, reload]);

  const items = useMemo(() => [...(thread.items || []), ...pending], [thread.items, pending]);

  const send = async (text) => {
    const tmp = { id: `pending-${Date.now()}`, sender: "user", body: text, created_at: new Date().toISOString(), pending: true };
    setPending((p) => [...p, tmp]);
    setDraft("");
    setSending(true);
    const res = await post("/api/messages", { body: text }, onSignedOut);
    if (res.ok) {
      await thread.reload();
      setPending((p) => p.filter((m) => m.id !== tmp.id));
    } else {
      setPending((p) => p.filter((m) => m.id !== tmp.id));
      setDraft(text);
      setToast("Couldn't send. Your message is still here.");
    }
    setSending(false);
  };

  const ask = async (offer) => {
    setBusyId(offer.id);
    const res = await post(`/api/offers/${offer.id}/request`, {}, onSignedOut);
    setBusyId(null);
    if (res.ok) { setToast("Sent to Kyle"); setSeg("kyle"); }
    else if (res.status === 409) setToast("You already asked about this one");
    else setToast("Couldn't send that. Try again.");
  };

  return (
    <>
      <Header kicker="Your coach" title="Coach" />
      <div role="group" aria-label="Coach sections" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: T.space[2] }}>
        {SEGS.map(([id, label]) => {
          const on = seg === id;
          return (
            <button key={id} type="button" className="wh-btn" aria-pressed={on} onClick={() => setSeg(id)}
              style={{ minHeight: 44, borderRadius: T.radius.control, border: "none", cursor: "pointer", fontFamily: T.font.display, fontWeight: 700, fontSize: 14, letterSpacing: ".08em", textTransform: "uppercase",
                background: on ? T.color.energy : T.color.surface2, color: on ? T.color.inkOnEnergy : T.color.muted }}>
              {label}
            </button>
          );
        })}
      </div>
      {seg === "kyle" && <Thread list={{ ...thread, items: thread.items === null ? null : items }} speaker={speaker} onSend={send} draft={draft} setDraft={setDraft} sending={sending} />}
      {seg === "history" && <HistoryList list={history} />}
      {seg === "offers" && <OfferCards list={offers} onAsk={ask} busyId={busyId} />}
      <Toast message={toast} tone={toast.startsWith("Sent") ? "good" : "warn"} onDone={clearToast} bottomOffset={seg === "kyle" ? T.space[8] * 4 + T.space[6] : T.space[8] * 3} />
    </>
  );
}
