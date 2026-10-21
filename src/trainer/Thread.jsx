import React, { useEffect, useMemo, useRef, useState } from "react";
import { T } from "../theme.js";
import { Button, Card } from "../ui/index.js";
import { post } from "../client/net.js";
import { groupByDay, timeLabel } from "../client/coach.js";
import { field, kicker, muted } from "../client/styles.js";
import { useGet } from "./useGet.js";

const MAX_LEN = 2000;
const pickThread = (d) => (d && Array.isArray(d.messages) ? d : null);

function Bubble({ m }) {
  const kyle = m.sender === "kyle";
  return (
    <div style={{ marginLeft: kyle ? "auto" : 0, marginRight: kyle ? 0 : "auto", maxWidth: "85%", textAlign: kyle ? "right" : "left" }}>
      <div style={{ display: "inline-block", textAlign: "left", background: kyle ? T.color.energyDeep : T.color.surface2, color: kyle ? T.color.onDeep : T.color.text,
        borderRadius: T.radius.card, padding: `${T.space[2]}px ${T.space[3]}px`, fontSize: T.type.body, lineHeight: 1.4, overflowWrap: "anywhere", whiteSpace: "pre-wrap", opacity: m.pending ? 0.7 : 1 }}>
        {m.body}
      </div>
      <div style={{ color: T.color.muted, fontSize: T.type.label }}>{m.pending ? "Sending" : timeLabel(m.created_at)}</div>
    </div>
  );
}

// THE CONVERSATION WITH ONE CLIENT AND ITS COMPOSER; THE GET MARKS THE THREAD READ, SO onRead FIRES WHEN THE SERVER SAYS IT MARKED ANY.
export function Thread({ clientId, onSignedOut, onRead }) {
  const thread = useGet(`/api/admin/users/${clientId}/messages`, onSignedOut, pickThread);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const endRef = useRef(null);
  const messages = thread.data ? thread.data.messages : [];
  const groups = useMemo(() => groupByDay(messages), [messages]);
  const marked = thread.data ? thread.data.marked : 0;
  useEffect(() => { if (marked > 0) onRead(); }, [marked]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (endRef.current) endRef.current.scrollTop = endRef.current.scrollHeight; }, [messages.length]);

  const text = draft.trim();
  const can = text.length >= 1 && text.length <= MAX_LEN && !sending;
  const send = async (e) => {
    e.preventDefault();
    if (!can) return;
    setSending(true); setErr("");
    const res = await post(`/api/admin/users/${clientId}/messages`, { body: text }, onSignedOut);
    if (res.ok) { setDraft(""); await thread.reload(); } else setErr("Couldn't send. Your message is still here.");
    setSending(false);
  };

  return (
    <Card style={{ padding: T.space[3], display: "grid", gap: T.space[3] }}>
      <div ref={endRef} role="log" aria-label="Conversation" style={{ display: "grid", gap: T.space[3], maxHeight: 360, overflowY: "auto", alignContent: "start" }}>
        {!thread.data && thread.loading && <p role="status" style={muted}>Loading</p>}
        {!thread.data && thread.error && <p role="alert" style={{ ...muted, color: T.color.warn }}>Couldn't load the conversation.</p>}
        {thread.data && messages.length === 0 && <p style={muted}>No messages yet.</p>}
        {groups.map((g) => (
          <div key={g.key} style={{ display: "grid", gap: T.space[2] }}>
            <h3 style={{ ...kicker, textAlign: "center" }}>{g.label}</h3>
            {g.messages.map((m) => <Bubble key={m.id} m={m} />)}
          </div>
        ))}
      </div>
      <form onSubmit={send} style={{ display: "flex", gap: T.space[2], alignItems: "flex-end" }}>
        <textarea className="wh-field" rows={2} value={draft} maxLength={MAX_LEN} aria-label="Message this client" placeholder="Message this client"
          onChange={(e) => setDraft(e.target.value)}
          style={{ ...field, flex: 1, minWidth: 0, minHeight: 48, padding: T.space[3], resize: "vertical", lineHeight: "22px" }} />
        <Button type="submit" disabled={!can} busy={sending} style={{ minHeight: 48 }}>Send</Button>
      </form>
      {err && <p role="alert" style={{ margin: 0, color: T.color.warn, fontSize: T.type.small }}>{err}</p>}
    </Card>
  );
}
