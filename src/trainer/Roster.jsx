import React, { useMemo, useState } from "react";
import { T } from "../theme.js";
import { Button, Chip, Header } from "../ui/index.js";
import { cardButton, field, kicker, muted } from "../client/styles.js";
import { clientSubline, needsYouLabel } from "./trainer.js";

const SEARCH_AFTER = 8;

const rowLook = (warn, selected) => ({
  ...cardButton, display: "flex", alignItems: "center", justifyContent: "space-between", gap: T.space[3], minHeight: 56,
  borderColor: warn ? T.color.warn : selected ? T.color.energy : T.color.line,
});

function Row({ title, sub, chip, tone, warn, selected, onClick }) {
  return (
    <button type="button" className="wh-btn" onClick={onClick} aria-current={selected ? "true" : undefined} style={rowLook(warn, selected)}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 600, color: T.color.text, fontSize: T.type.body }}>{title}</span>
        <span style={{ ...muted, display: "block", overflowWrap: "anywhere" }}>{sub}</span>
      </span>
      <Chip tone={tone}>{chip}</Chip>
    </button>
  );
}

function needsSub(e) {
  if (e.kind === "missed") return `Missed ${e.detail}`;
  if (e.kind === "unread") return e.count === 1 ? "1 message waiting" : `${e.count} messages waiting`;
  return "Kyle's replies waiting for approval";
}

export function Roster({ roster, session, selectedId, onOpenClient, onOpenDrafts, onAdd }) {
  const [q, setQ] = useState("");
  const { data, loading, error, refetch } = roster;
  const clients = data ? data.clients : [];
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return clients;
    return clients.filter((c) => `${c.name} ${c.email}`.toLowerCase().includes(needle));
  }, [clients, q]);
  const first = (session?.name || "").trim().split(/\s+/)[0] || "Trainer";

  return (
    <section aria-label="Roster" style={{ display: "grid", gap: T.space[3], alignContent: "start" }}>
      <Header kicker={`${first} · Console`} title="Roster" />
      {!data && loading && <p role="status" style={muted}>Loading</p>}
      {!data && error && (
        <div role="alert" style={{ display: "grid", gap: T.space[3], justifyItems: "start" }}>
          <p style={{ margin: 0, color: T.color.warn }}>Couldn't load the roster. Check your connection and try again.</p>
          <Button variant="quiet" onClick={refetch}>Try again</Button>
        </div>
      )}
      {data && (
        <>
          {data.needsYou.length > 0 && (
            <>
              <h2 style={{ ...kicker, marginTop: T.space[2] }}>Needs you</h2>
              <div style={{ display: "grid", gap: T.space[2] }}>
                {data.needsYou.map((e) => (
                  e.kind === "drafts"
                    ? <Row key="drafts" title={`${e.count} draft${e.count === 1 ? "" : "s"}`} sub={needsSub(e)} chip={needsYouLabel(e)} tone="default" warn onClick={onOpenDrafts} />
                    : <Row key={`${e.kind}:${e.user_id}`} title={e.user_name} sub={needsSub(e)} chip={needsYouLabel(e)} tone="warn" warn onClick={() => onOpenClient(e.user_id)} />
                ))}
              </div>
            </>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: T.space[3], marginTop: T.space[2] }}>
            <h2 style={kicker}>Everyone · {clients.length}</h2>
            <Chip tone="energy" onClick={onAdd}>+ Add client</Chip>
          </div>
          {clients.length > SEARCH_AFTER && (
            <input className="wh-field" type="search" aria-label="Search clients" placeholder="Search by name or email" value={q}
              onChange={(e) => setQ(e.target.value)} style={field} />
          )}
          {clients.length === 0 && <p style={{ ...muted, fontSize: T.type.body }}>No clients yet. Add your first client by email.</p>}
          {clients.length > 0 && shown.length === 0 && <p style={{ ...muted, fontSize: T.type.body }}>No client matches that search.</p>}
          <div style={{ display: "grid", gap: T.space[2] }}>
            {shown.map((c) => (
              <Row key={c.id} title={c.name} sub={clientSubline(c)} selected={c.id === selectedId}
                chip={c.on_track ? "On track" : "Needs you"} tone={c.on_track ? "good" : "warn"} onClick={() => onOpenClient(c.id)} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
