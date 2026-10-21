import React, { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardList, Inbox, Tag, User, Users } from "lucide-react";
import { T } from "../theme.js";
import { Card, TabBar, Toast } from "../ui/index.js";
import { LegacyShell } from "../app/LegacyShell.jsx";
import { kicker, muted } from "../client/styles.js";
import { useRoster } from "./useRoster.js";
import { Roster } from "./Roster.jsx";
import { Client } from "./Client.jsx";
import { AddClientSheet } from "./AddClientSheet.jsx";

const ITEMS = [
  { id: "roster", label: "Roster", icon: Users },
  { id: "build", label: "Build", icon: ClipboardList },
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "offers", label: "Offers", icon: Tag },
  { id: "you", label: "You", icon: User },
];

const WIDE = "(min-width: 901px)";

function useWide() {
  const [wide, setWide] = useState(() => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(WIDE).matches : false));
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

export function TrainerShell({ session, onSignedOut }) {
  const roster = useRoster(onSignedOut);
  const wide = useWide();
  const [tab, setTab] = useState("roster");
  const [clientId, setClientId] = useState(null);
  const [inboxView, setInboxView] = useState("inbox");
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState("");
  const clearToast = useCallback(() => setToast(""), []);

  // THE ROSTER (AND ITS NEEDS-YOU COUNTS) IS REFETCHED EVERY TIME THE TRAINER COMES BACK TO IT FROM ANOTHER TAB.
  const first = useRef(true);
  const reloadRoster = roster.refetch;
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (tab === "roster") reloadRoster();
  }, [tab, reloadRoster]);

  const unread = roster.data ? roster.data.needsYou.filter((e) => e.kind === "unread").reduce((n, e) => n + e.count, 0) : 0;
  const select = (id) => { if (id === "inbox") setInboxView("inbox"); setTab(id); };
  const openDrafts = () => { setInboxView("drafts"); setTab("inbox"); };

  const frame = { minHeight: "100dvh", background: T.color.bg, color: T.color.body, fontFamily: T.font.body };
  const pad = { padding: `${T.space[4]}px ${T.space[4]}px calc(${T.space[8] * 3}px + env(safe-area-inset-bottom))` };

  let body;
  if (tab === "roster") {
    const rosterEl = (
      <Roster roster={roster} session={session} selectedId={clientId} onOpenClient={setClientId} onOpenDrafts={openDrafts} onAdd={() => setAdding(true)} />
    );
    const clientEl = clientId && (
      <Client key={clientId} id={clientId} narrow={!wide} onBack={() => setClientId(null)} onSignedOut={onSignedOut} onChanged={reloadRoster} />
    );
    body = wide ? (
      <main style={{ ...pad, maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(0, 380px) minmax(0, 1fr)", gap: T.space[7], alignItems: "start" }}>
        {rosterEl}
        {clientEl || (
          <Card style={{ padding: T.space[5], marginTop: T.space[8] }}>
            <p style={kicker}>No client open</p>
            <p style={{ ...muted, margin: `${T.space[2]}px 0 0`, fontSize: T.type.body }}>Pick someone from the roster to see their week, readiness and conversation.</p>
          </Card>
        )}
      </main>
    ) : (
      <main style={{ ...pad, maxWidth: 430, margin: "0 auto" }}>{clientEl || rosterEl}</main>
    );
  } else if (tab === "offers") {
    body = (
      <main style={{ ...pad, maxWidth: 430, margin: "0 auto" }}>
        <Card style={{ padding: T.space[4] }}>
          <p style={kicker}>Offers</p>
          <p style={{ ...muted, margin: `${T.space[2]}px 0 0`, fontSize: T.type.body }}>Offers arrive in the next unit.</p>
        </Card>
      </main>
    );
  } else {
    const view = tab === "inbox" ? inboxView : tab;
    body = (
      <div style={{ paddingBottom: `calc(${T.space[8] * 2}px + env(safe-area-inset-bottom))` }}>
        <LegacyShell mode="trainer" session={session} onSignedOut={onSignedOut} view={view} />
      </div>
    );
  }

  return (
    <div style={frame}>
      {body}
      <TabBar label="Trainer" items={ITEMS.map((i) => (i.id === "inbox" ? { ...i, badge: unread } : i))} active={tab} onSelect={select} />
      {adding && (
        <AddClientSheet onClose={() => setAdding(false)} onSignedOut={onSignedOut}
          onAdded={(email) => { setAdding(false); setToast(`Link sent to ${email}`); reloadRoster(); }} />
      )}
      <Toast message={toast} tone="good" onDone={clearToast} />
    </div>
  );
}
