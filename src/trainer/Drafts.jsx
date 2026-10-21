import React, { useState } from "react";
import { T } from "../theme.js";
import { Button, Card } from "../ui/index.js";
import { call } from "../client/net.js";
import { cardButton, field, kicker, muted } from "../client/styles.js";
import { BackLink, ErrorText, LoadState } from "./parts.jsx";
import { ageLabel } from "./trainer.js";

const MAX_LEN = 2000;

// ONE DRAFT: EDIT THE TEXT, THEN APPROVE (AN EDITED TEXT IS PATCHED FIRST) OR REJECT.
function DraftDetail({ draft, onBack, onDone, onSignedOut }) {
  const [body, setBody] = useState(draft.body || "");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const text = body.trim();
  const base = `/api/admin/drafts/${draft.id}`;

  const approve = async () => {
    if (!text) { setErr("Write something before sending."); return; }
    setBusy("approve"); setErr("");
    if (text !== (draft.body || "").trim()) {
      const saved = await call(base, { method: "PATCH", body: JSON.stringify({ body: text }) }, onSignedOut);
      if (!saved.ok) { setBusy(""); setErr("Couldn't save your edit. Nothing was sent."); return; }
    }
    const res = await call(`${base}/approve`, { method: "POST" }, onSignedOut);
    setBusy("");
    if (res.ok) onDone(`Sent to ${draft.user.name}`);
    else setErr("Couldn't send it. Your edit is saved; try again.");
  };

  const reject = async () => {
    setBusy("reject"); setErr("");
    const res = await call(`${base}/reject`, { method: "POST" }, onSignedOut);
    setBusy("");
    if (res.ok) onDone("Draft rejected");
    else setErr("Couldn't reject it. Try again.");
  };

  return (
    <section aria-label="Draft" style={{ display: "grid", gap: T.space[3], alignContent: "start" }}>
      <BackLink label="Drafts" onBack={onBack} />
      <Card style={{ display: "grid", gap: T.space[2] }}>
        <p style={kicker}>Kyle's draft for</p>
        <p style={{ margin: 0, fontFamily: T.font.display, fontWeight: 800, fontSize: 24, color: T.color.text, lineHeight: 1.05 }}>{draft.user.name}</p>
        {draft.trigger_summary && <p style={{ ...muted, margin: 0 }}>{draft.trigger_summary}</p>}
      </Card>
      <label htmlFor="dr-body" style={kicker}>Message</label>
      <textarea id="dr-body" className="wh-field" rows={7} value={body} maxLength={MAX_LEN} onChange={(e) => setBody(e.target.value)}
        style={{ ...field, padding: T.space[3], resize: "vertical", lineHeight: "22px" }} />
      <ErrorText>{err}</ErrorText>
      <Button full busy={busy === "approve"} disabled={!!busy} onClick={approve}>Approve & send</Button>
      <Button variant="quiet" full busy={busy === "reject"} disabled={!!busy} onClick={reject}>Reject</Button>
    </section>
  );
}

export function Drafts({ drafts, onChanged, onSignedOut, notify }) {
  const [openId, setOpenId] = useState(null);
  const list = drafts.data || [];
  const open = list.find((d) => d.id === openId);
  if (open) {
    return (
      <DraftDetail key={open.id} draft={open} onBack={() => setOpenId(null)} onSignedOut={onSignedOut}
        onDone={(m) => { setOpenId(null); notify(m); drafts.reload(); onChanged(); }} />
    );
  }
  return (
    <div style={{ display: "grid", gap: T.space[2] }}>
      <LoadState res={drafts} what="the drafts" />
      {drafts.data && list.length === 0 && (
        <p style={{ ...muted, fontSize: T.type.body }}>No drafts waiting. Kyle's replies appear here after a check-in or a session.</p>
      )}
      {list.map((d) => (
        <button key={d.id} type="button" className="wh-btn" onClick={() => setOpenId(d.id)} style={{ ...cardButton, display: "grid", gap: 2, minHeight: 56, borderColor: T.color.warn }}>
          <span style={{ display: "flex", justifyContent: "space-between", gap: T.space[3] }}>
            <span style={{ fontWeight: 600, color: T.color.text }}>{d.user.name}</span>
            <span style={muted}>{ageLabel(d.created_at)}</span>
          </span>
          {d.trigger_summary && <span style={{ ...muted, overflowWrap: "anywhere" }}>{d.trigger_summary}</span>}
          <span style={{ color: T.color.body, fontSize: T.type.small, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.body}</span>
        </button>
      ))}
    </div>
  );
}
