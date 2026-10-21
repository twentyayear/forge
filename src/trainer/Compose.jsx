import React, { useState } from "react";
import { T } from "../theme.js";
import { Button, Card, Header } from "../ui/index.js";
import { post } from "../client/net.js";
import { field, fieldLabel, kicker, muted } from "../client/styles.js";
import { BackLink, ClientPick, ErrorText, Switch, ToggleChip } from "./parts.jsx";
import { groupByBody } from "./trainer.js";

const INTENTS = [
  { id: "encourage", label: "Encourage" },
  { id: "checkin", label: "Check in" },
  { id: "correct", label: "Fix form" },
  { id: "offer", label: "Offer" },
  { id: "custom", label: "Custom" },
];
const DRAFT_MAX = 5;
const SEND_MAX = 50;
const MAX_LEN = 2000;
const area = { ...field, padding: T.space[3], resize: "vertical", lineHeight: "22px" };

export function Compose({ clients, onBack, onSent, onSignedOut, notify }) {
  const [picked, setPicked] = useState([]);
  const [intent, setIntent] = useState("encourage");
  const [notes, setNotes] = useState("");
  const [texts, setTexts] = useState({}); // user_id -> draft text
  const [failed, setFailed] = useState({}); // user_id -> true when Kyle's draft didn't come through
  const [shared, setShared] = useState(false);
  const [sharedBody, setSharedBody] = useState("");
  const [email, setEmail] = useState(true);
  const [drafting, setDrafting] = useState(false);
  const [draftErr, setDraftErr] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");

  const nameOf = (id) => (clients || []).find((c) => c.id === id)?.name || "Client";
  const toggle = (id) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= SEND_MAX ? cur : [...cur, id]));
  const tooMany = picked.length > DRAFT_MAX;

  const draft = async () => {
    setDraftErr(""); setErr("");
    setDrafting(true);
    const body = { user_ids: picked, intent };
    if (notes.trim()) body.notes = notes.trim();
    const res = await post("/api/admin/compose", body, onSignedOut);
    setDrafting(false);
    if (!res.ok || !res.data || !Array.isArray(res.data.drafts)) {
      setDraftErr(res.status === 429 ? "Too many drafts right now. Try again in a minute, or write the messages yourself." : "Couldn't reach Kyle's drafting. Write the messages yourself, or try again.");
      return;
    }
    const nextTexts = {}; const nextFailed = {};
    for (const d of res.data.drafts) {
      if (d.body) nextTexts[d.user_id] = d.body;
      else nextFailed[d.user_id] = true;
    }
    setTexts((cur) => ({ ...cur, ...nextTexts }));
    setFailed(nextFailed);
  };

  const toggleShared = (on) => {
    if (on && !sharedBody.trim()) {
      const first = picked.map((id) => texts[id]).find((t) => t && t.trim());
      if (first) setSharedBody(first);
    }
    setShared(on);
  };

  const rows = picked.map((id) => ({ user_id: id, body: shared ? sharedBody : texts[id] }));
  const missing = rows.filter((r) => !String(r.body || "").trim());
  const canSend = picked.length > 0 && missing.length === 0 && !sending;

  const send = async () => {
    setErr("");
    setSending(true);
    const groups = groupByBody(rows);
    let sent = 0; let emailed = 0; const left = [];
    for (const g of groups) {
      const res = await post("/api/admin/messages/broadcast", { user_ids: g.user_ids, body: g.body, email }, onSignedOut);
      if (res.ok && res.data && Array.isArray(res.data.sent)) {
        sent += res.data.sent.length;
        emailed += res.data.sent.filter((s) => s.emailed).length;
      } else left.push(...g.user_ids);
    }
    setSending(false);
    if (sent > 0) notify(`Sent to ${sent} · emailed ${emailed}`);
    if (left.length === 0) { onSent(); return; }
    setPicked(left);
    setErr(`${left.length} message${left.length === 1 ? "" : "s"} didn't go through. ${sent > 0 ? "The rest were sent. " : ""}Your text is still here; try again.`);
  };

  return (
    <section aria-label="Compose" style={{ display: "grid", gap: T.space[3], alignContent: "start" }}>
      <BackLink label="Inbox" onBack={onBack} />
      <Header kicker="Console" title="Compose" />
      <div>
        <span style={fieldLabel}>To · {picked.length}</span>
        <ClientPick label="Recipients" clients={clients} selected={picked} onToggle={toggle} />
      </div>
      <div>
        <span style={fieldLabel}>Kyle wants to</span>
        <div role="group" aria-label="Intent" style={{ display: "flex", flexWrap: "wrap", gap: T.space[2] }}>
          {INTENTS.map((i) => <ToggleChip key={i.id} on={intent === i.id} onClick={() => setIntent(i.id)}>{i.label}</ToggleChip>)}
        </div>
      </div>
      <div>
        <label htmlFor="cp-notes" style={fieldLabel}>Notes for Kyle (optional)</label>
        <textarea id="cp-notes" className="wh-field" rows={2} maxLength={500} placeholder="Both missed Monday, readiness is low, be warm not pushy" value={notes} onChange={(e) => setNotes(e.target.value)} style={area} />
      </div>
      <Button variant="quiet" full busy={drafting} disabled={picked.length === 0 || tooMany} onClick={draft}>Draft with AI · one per client</Button>
      {tooMany && <p style={muted}>Kyle drafts for up to {DRAFT_MAX} clients at a time. Deselect some to draft, or write one message for everyone below.</p>}
      <ErrorText>{draftErr}</ErrorText>

      {picked.length > 0 && (
        <>
          <Switch on={shared} onChange={toggleShared} label="Same message for everyone" hint={shared ? "One text goes to every client you picked." : "Each client gets their own text."} />
          {shared ? (
            <div>
              <label htmlFor="cp-shared" style={fieldLabel}>Message to {picked.length} client{picked.length === 1 ? "" : "s"}</label>
              <textarea id="cp-shared" className="wh-field" rows={5} maxLength={MAX_LEN} value={sharedBody} onChange={(e) => setSharedBody(e.target.value)} style={area} />
            </div>
          ) : (
            picked.map((id) => (
              <Card key={id} style={{ display: "grid", gap: T.space[2] }}>
                <label htmlFor={`cp-${id}`} style={kicker}>{nameOf(id)} · {failed[id] ? "write it yourself" : texts[id] ? "draft" : "message"}</label>
                {failed[id] && <p role="status" style={{ margin: 0, color: T.color.warn, fontSize: T.type.small }}>Kyle's draft didn't come through; write it yourself.</p>}
                <textarea id={`cp-${id}`} className="wh-field" rows={4} maxLength={MAX_LEN} value={texts[id] || ""} onChange={(e) => setTexts((cur) => ({ ...cur, [id]: e.target.value }))} style={area} />
              </Card>
            ))
          )}
          <div style={{ display: "flex", alignItems: "center", gap: T.space[2], flexWrap: "wrap" }}>
            <ToggleChip on disabled aria-label="In app, always on">In app</ToggleChip>
            <ToggleChip on={email} onClick={() => setEmail(!email)}>Email</ToggleChip>
            <span style={muted}>as Kyle</span>
          </div>
          {missing.length > 0 && <p style={muted}>{shared ? "Write the message to send it." : `Still to write: ${missing.map((m) => nameOf(m.user_id)).join(", ")}.`}</p>}
        </>
      )}
      <ErrorText>{err}</ErrorText>
      <Button full busy={sending} disabled={!canSend} onClick={send}>{picked.length ? `Send ${picked.length} message${picked.length === 1 ? "" : "s"}` : "Send"}</Button>
    </section>
  );
}
