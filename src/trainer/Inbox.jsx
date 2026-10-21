import React from "react";
import { T } from "../theme.js";
import { Chip, Header } from "../ui/index.js";
import { cardButton, muted } from "../client/styles.js";
import { BackLink, LoadState, Seg } from "./parts.jsx";
import { Thread } from "./Thread.jsx";
import { Drafts } from "./Drafts.jsx";
import { Compose } from "./Compose.jsx";
import { ageLabel } from "./trainer.js";

function Threads({ inbox, onOpen }) {
  const rows = inbox.data || [];
  return (
    <div style={{ display: "grid", gap: T.space[2] }}>
      <LoadState res={inbox} what="the inbox" />
      {inbox.data && rows.length === 0 && <p style={{ ...muted, fontSize: T.type.body }}>No conversations yet. Messages from clients land here.</p>}
      {rows.map((r) => {
        // THE INBOX ROUTE SHAPES EACH ROW AS {user:{id,name,email}, last_message:{sender,body,created_at}|null, unread}.
        const user = r.user || {};
        const last = r.last_message || null;
        const unread = Number(r.unread) || 0;
        return (
          <button key={user.id} type="button" className="wh-btn" onClick={() => onOpen({ id: user.id, name: user.name })}
            style={{ ...cardButton, display: "flex", alignItems: "center", justifyContent: "space-between", gap: T.space[3], minHeight: 56, borderColor: unread ? T.color.energy : T.color.line }}>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: "block", fontWeight: 600, color: T.color.text }}>{user.name}</span>
              <span style={{ ...muted, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {last ? `${last.sender === "kyle" ? "You: " : ""}${last.body}` : "No messages yet"}
              </span>
            </span>
            <span style={{ display: "grid", gap: 4, justifyItems: "end", flexShrink: 0 }}>
              <span style={muted}>{last ? ageLabel(last.created_at) : ""}</span>
              {unread > 0 && <Chip tone="energy">{unread}</Chip>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// THREADS, DRAFTS AND COMPOSE; WHICH ONE SHOWS IS HELD BY THE SHELL SO A NEEDS-YOU ROW OR AN OFFER REQUEST CAN OPEN IT DIRECTLY.
export function Inbox({ nav, onNav, inbox, drafts, clients, onChanged, onSignedOut, notify }) {
  if (nav.compose) {
    return (
      <Compose clients={clients} onBack={() => onNav({ compose: false })} onSignedOut={onSignedOut} notify={notify}
        onSent={() => { onNav({ compose: false }); inbox.reload(); onChanged(); }} />
    );
  }
  if (nav.thread) {
    return (
      <section aria-label="Conversation" style={{ display: "grid", gap: T.space[3], alignContent: "start" }}>
        <BackLink label="Inbox" onBack={() => { onNav({ thread: null }); inbox.reload(); }} />
        <Header kicker="Conversation" title={nav.thread.name} />
        <Thread key={nav.thread.id} clientId={nav.thread.id} onSignedOut={onSignedOut} onRead={() => { inbox.reload(); onChanged(); }} />
      </section>
    );
  }
  const pending = drafts.data ? drafts.data.length : 0;
  return (
    <section aria-label="Inbox" style={{ display: "grid", gap: T.space[3], alignContent: "start" }}>
      <Header kicker="Console" title="Inbox" right={<Chip tone="energy" onClick={() => onNav({ compose: true })}>Compose</Chip>} />
      <Seg label="Inbox sections" value={nav.view} onChange={(view) => onNav({ view })}
        items={[{ id: "inbox", label: "Threads" }, { id: "drafts", label: "Drafts", badge: pending }]} />
      {nav.view === "inbox"
        ? <Threads inbox={inbox} onOpen={(thread) => onNav({ thread })} />
        : <Drafts drafts={drafts} onChanged={onChanged} onSignedOut={onSignedOut} notify={notify} />}
    </section>
  );
}
